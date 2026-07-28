' =============================================================================
' streamshogun_api.brs — Authenticated StreamShōgun API helpers
' =============================================================================

function GetDefaultApiBaseUrl() as String
    info = CreateObject("roAppInfo")
    apiBase = info.GetValue("api_base_url")
    if apiBase = invalid or apiBase = "" then apiBase = "https://api.streamshogun.com"
    return NormalizeApiBaseUrl(apiBase)
end function

function NormalizeApiBaseUrl(apiBase as String) as String
    if apiBase = invalid then apiBase = ""
    cleaned = TrimString(apiBase)
    while Len(cleaned) > 1 and Right(cleaned, 1) = "/"
        cleaned = Left(cleaned, Len(cleaned) - 1)
    end while
    return cleaned
end function

function BuildApiUrl(apiBase as String, path as String) as String
    base = NormalizeApiBaseUrl(apiBase)
    if base = "" then base = GetDefaultApiBaseUrl()
    if Left(path, 1) <> "/" then path = "/" + path
    return base + path
end function

function ApiGetJson(apiBase as String, path as String, accessToken as String) as Object
    return ApiRequestJson("GET", BuildApiUrl(apiBase, path), invalid, accessToken)
end function

function ApiPostJson(apiBase as String, path as String, body as Object, accessToken as String) as Object
    return ApiRequestJson("POST", BuildApiUrl(apiBase, path), body, accessToken)
end function

function ApiRequestJson(method as String, url as String, body as Dynamic, accessToken as String) as Object
    http = CreateObject("roUrlTransfer")
    http.SetCertificatesFile("common:/certs/ca-bundle.crt")
    http.InitClientCertificates()
    http.SetUrl(url)
    http.EnableEncodings(true)

    headers = {
        "User-Agent": "StreamShogun/1.0 Roku",
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    if accessToken <> invalid and accessToken <> ""
        headers["Authorization"] = "Bearer " + accessToken
    end if
    http.SetHeaders(headers)

    port = CreateObject("roMessagePort")
    http.SetMessagePort(port)

    started = false
    if method = "POST"
        payload = "{}"
        if body <> invalid then payload = FormatJSON(body)
        started = http.AsyncPostFromString(payload)
    else
        started = http.AsyncGetToString()
    end if

    if not started
        return { ok: false, code: -1, error: "Failed to start API request." }
    end if

    msg = wait(30000, port)
    if msg = invalid
        return { ok: false, code: -1, error: "API request timed out." }
    end if

    code = msg.GetResponseCode()
    responseBody = msg.GetString()
    parsed = invalid
    if responseBody <> invalid and responseBody <> ""
        parsed = ParseJSON(responseBody)
    end if

    if code >= 200 and code < 300
        return { ok: true, code: code, body: responseBody, json: parsed }
    end if

    message = "HTTP " + Str(code).Trim()
    if parsed <> invalid and parsed.message <> invalid and parsed.message <> ""
        message = parsed.message
    end if
    return { ok: false, code: code, error: message, json: parsed }
end function

function ApiGetTextUrl(url as String, accessToken as String) as Object
    http = CreateObject("roUrlTransfer")
    http.SetCertificatesFile("common:/certs/ca-bundle.crt")
    http.InitClientCertificates()
    http.SetUrl(url)
    http.EnableEncodings(true)

    headers = {
        "User-Agent": "StreamShogun/1.0 Roku",
        "Accept": "application/xml, text/xml, */*"
    }
    if accessToken <> invalid and accessToken <> ""
        headers["Authorization"] = "Bearer " + accessToken
    end if
    http.SetHeaders(headers)

    port = CreateObject("roMessagePort")
    http.SetMessagePort(port)

    if http.AsyncGetToString()
        msg = wait(30000, port)
        if msg <> invalid
            code = msg.GetResponseCode()
            body = msg.GetString()
            if code >= 200 and code < 300
                return { ok: true, body: body, code: code }
            end if
            return { ok: false, body: "", code: code, error: "HTTP " + Str(code).Trim() }
        end if
        return { ok: false, body: "", code: -1, error: "API request timed out." }
    end if

    return { ok: false, body: "", code: -1, error: "Failed to start API request." }
end function

function BuildEpgProxyUrl(apiBase as String, epgUrl as String) as String
    return BuildApiUrl(apiBase, "/v1/roku/epg?url=" + EncodeQueryParam(epgUrl))
end function

function IsMasterJapanKoreaGuide(url as String) as Boolean
    return LCase(TrimString(url)) = "streamshogun:master-japan-korea"
end function

function FetchMasterJapanKoreaGuide() as Object
    session = LoadAccountSession()
    if session.accessToken = invalid or session.accessToken = ""
        return { ok: false, error: "Sign in to your StreamShogun account first." }
    end if

    result = ApiGetTextUrl(BuildApiUrl(session.apiBaseUrl, "/v1/master/japan-korea.xml"), session.accessToken)
    if not result.ok then return result
    if result.body = invalid or result.body = ""
        return { ok: false, error: "The combined guide response was empty." }
    end if
    return result
end function

function IsMasterPlaylist(url as String) as Boolean
    return LCase(TrimString(url)) = "streamshogun:master-playlist"
end function

function FetchMasterPlaylist() as Object
    session = LoadAccountSession()
    if session.accessToken = invalid or session.accessToken = ""
        return { ok: false, error: "Sign in to your StreamShogun account first." }
    end if
    return ApiGetTextUrl(BuildApiUrl(session.apiBaseUrl, "/v1/master/playlist.m3u"), session.accessToken)
end function

function EncodeQueryParam(value as String) as String
    encoded = value
    encoded = encoded.Replace("%", "%25")
    encoded = encoded.Replace("&", "%26")
    encoded = encoded.Replace("=", "%3D")
    encoded = encoded.Replace("?", "%3F")
    encoded = encoded.Replace("#", "%23")
    encoded = encoded.Replace(" ", "%20")
    encoded = encoded.Replace("+", "%2B")
    return encoded
end function
