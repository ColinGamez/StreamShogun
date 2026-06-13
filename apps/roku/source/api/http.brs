' =============================================================================
' http.brs — HTTP GET helper with caching support
' =============================================================================
' Task-safe: meant to be called from Task thread (roUrlTransfer).
' Supports gzip detection, local caching with TTL.
' =============================================================================

' Perform an HTTP GET. Returns { ok: Boolean, body: String, code: Integer }
' If cacheKey is provided and TTL is valid, returns cached version.
function HttpGet(url as String, cacheKey as String, ttlSeconds as Integer) as Object
    ' Check cache first
    if cacheKey <> "" and ttlSeconds > 0
        cached = ReadCache(cacheKey, ttlSeconds)
        if cached <> invalid
            SafeLog("HTTP", "Cache hit for key: " + cacheKey)
            return { ok: true, body: cached, code: 200, fromCache: true }
        end if
    end if

    ' Validate URL
    if not StartsWith(LCase(url), "http://") and not StartsWith(LCase(url), "https://")
        return { ok: false, body: "", code: 0, error: "Invalid URL: must start with http:// or https://" }
    end if

    http = CreateObject("roUrlTransfer")
    http.SetCertificatesFile("common:/certs/ca-bundle.crt")
    http.InitClientCertificates()
    http.SetUrl(url)
    http.EnableEncodings(true) ' Enables automatic gzip decompression
    http.SetHeaders({
        "User-Agent": "StreamShogun/1.0 Roku",
        "Accept-Encoding": "gzip, deflate"
    })

    SafeLog("HTTP", "GET " + RedactUrl(url))

    port = CreateObject("roMessagePort")
    http.SetMessagePort(port)

    if http.AsyncGetToString()
        msg = wait(30000, port) ' 30 second timeout
        if msg <> invalid
            code = msg.GetResponseCode()
            body = msg.GetString()
            if code >= 200 and code < 300
                ' Check if response is gzip-compressed .gz file
                ' EnableEncodings should handle this, but the URL might be
                ' a raw .gz file served without Content-Encoding
                if IsGzipContent(url, body)
                    ' Roku's roUrlTransfer with EnableEncodings(true) should
                    ' handle Content-Encoding: gzip automatically.
                    ' For raw .gz files without proper headers, we need a workaround.
                    ' Save to tmp and try to read — Roku handles some gzip natively.
                    body = TryDecompressGzip(body, cacheKey)
                end if

                ' Cache the result
                if cacheKey <> "" and ttlSeconds > 0
                    WriteCache(cacheKey, body)
                end if

                return { ok: true, body: body, code: code, fromCache: false }
            else
                return { ok: false, body: "", code: code, error: "HTTP " + Str(code) }
            end if
        else
            return { ok: false, body: "", code: -1, error: "Request timed out" }
        end if
    else
        return { ok: false, body: "", code: -1, error: "Failed to start request" }
    end if
end function

function HttpGetWithAuth(url as String, cacheKey as String, ttlSeconds as Integer, accessToken as String) as Object
    ' Check cache first
    if cacheKey <> "" and ttlSeconds > 0
        cached = ReadCache(cacheKey, ttlSeconds)
        if cached <> invalid
            SafeLog("HTTP", "Cache hit for key: " + cacheKey)
            return { ok: true, body: cached, code: 200, fromCache: true }
        end if
    end if

    ' Validate URL
    if not StartsWith(LCase(url), "http://") and not StartsWith(LCase(url), "https://")
        return { ok: false, body: "", code: 0, error: "Invalid URL: must start with http:// or https://" }
    end if

    http = CreateObject("roUrlTransfer")
    http.SetCertificatesFile("common:/certs/ca-bundle.crt")
    http.InitClientCertificates()
    http.SetUrl(url)
    http.EnableEncodings(true)

    headers = {
        "User-Agent": "StreamShogun/1.0 Roku",
        "Accept-Encoding": "gzip, deflate"
    }
    if accessToken <> invalid and accessToken <> ""
        headers["Authorization"] = "Bearer " + accessToken
    end if
    http.SetHeaders(headers)

    SafeLog("HTTP", "GET " + RedactUrl(url))

    port = CreateObject("roMessagePort")
    http.SetMessagePort(port)

    if http.AsyncGetToString()
        msg = wait(30000, port)
        if msg <> invalid
            code = msg.GetResponseCode()
            body = msg.GetString()
            if code >= 200 and code < 300
                if IsGzipContent(url, body)
                    body = TryDecompressGzip(body, cacheKey)
                end if

                if cacheKey <> "" and ttlSeconds > 0
                    WriteCache(cacheKey, body)
                end if

                return { ok: true, body: body, code: code, fromCache: false }
            else
                return { ok: false, body: "", code: code, error: "HTTP " + Str(code) }
            end if
        else
            return { ok: false, body: "", code: -1, error: "Request timed out" }
        end if
    else
        return { ok: false, body: "", code: -1, error: "Failed to start request" }
    end if
end function

' Detect if content might be gzip-compressed
function IsGzipContent(url as String, body as String) as Boolean
    ' Check URL extension
    if EndsWith(LCase(url), ".gz") then return true
    if EndsWith(LCase(url), ".xml.gz") then return true
    ' Check magic bytes (gzip: 1f 8b)
    if Len(body) >= 2
        b1 = Asc(Mid(body, 1, 1))
        b2 = Asc(Mid(body, 2, 1))
        if b1 = 31 and b2 = 139 then return true
    end if
    return false
end function

' Attempt to decompress gzip content
' Roku's EnableEncodings(true) handles Content-Encoding: gzip.
' For raw .gz files, we save to tmp: and try alternate approach.
function TryDecompressGzip(body as String, key as String) as String
    if key = invalid or key = "" then key = "download"

    ' Write compressed bytes to tmp
    tmpPath = "tmp:/" + key + ".gz"
    xmlPath = "tmp:/" + key + ".xml"

    ba = CreateObject("roByteArray")
    ba.FromAsciiString(body)
    ba.WriteFile(tmpPath)

    ' Roku does not have a native gunzip API.
    ' If EnableEncodings(true) didn't decompress, the body may still be
    ' compressed. We store it and return what we have.
    ' The XMLTV parser will detect and report a parse error, prompting
    ' the user to use a non-gzipped URL or a proxy.
    SafeLog("HTTP", "Gzip file detected. If parsing fails, a decompression proxy may be needed.")
    return body
end function

' ── Cache helpers ───────────────────────────────────────────────────
sub WriteCache(key as String, data as String)
    path = "tmp:/" + key + ".cache"
    ba = CreateObject("roByteArray")
    ba.FromAsciiString(data)
    ba.WriteFile(path)

    ' Store timestamp
    sec = GetRegistrySection("cache")
    now = CreateObject("roDateTime")
    sec.Write(key + "_ts", Str(now.AsSeconds()).Trim())
    sec.Flush()
end sub

function ReadCache(key as String, ttlSeconds as Integer) as Dynamic
    ' Check timestamp
    sec = GetRegistrySection("cache")
    tsStr = sec.Read(key + "_ts")
    if tsStr = invalid or tsStr = "" then return invalid

    ts = Val(tsStr)
    now = CreateObject("roDateTime")
    elapsed = now.AsSeconds() - ts
    if elapsed > ttlSeconds then return invalid

    ' Read cached file
    path = "tmp:/" + key + ".cache"
    ba = CreateObject("roByteArray")
    if ba.ReadFile(path)
        return ba.ToAsciiString()
    end if
    return invalid
end function

sub ClearCache(key as String)
    path = "tmp:/" + key + ".cache"
    fs = CreateObject("roFileSystem")
    fs.Delete(path)
    sec = GetRegistrySection("cache")
    sec.Delete(key + "_ts")
    sec.Flush()
end sub
