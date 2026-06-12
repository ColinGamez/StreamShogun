' =============================================================================
' redact.brs — URL/token redaction for safe logging and error display
' =============================================================================

' Redact sensitive parts of a URL for display.
' Keeps protocol + host, masks path/query.
function RedactUrl(url as String) as String
    if url = invalid or url = "" then return "[no url]"

    ' Find the end of scheme://host
    schemeEnd = Instr(1, url, "://")
    if schemeEnd = 0 then return "[redacted url]"

    hostStart = schemeEnd + 3
    slashPos = Instr(hostStart, url, "/")
    if slashPos = 0
        ' URL is just scheme://host
        return url
    end if

    host = Left(url, slashPos - 1)
    return host + "/***"
end function

' Redact query-string tokens from a URL for logging.
function RedactTokens(url as String) as String
    if url = invalid or url = "" then return ""
    qPos = Instr(1, url, "?")
    if qPos = 0 then return url

    base = Left(url, qPos - 1)
    query = Mid(url, qPos + 1)
    parts = query.Split("&")
    cleaned = []
    for each part in parts
        eqPos = Instr(1, part, "=")
        if eqPos > 0
            key = LCase(Left(part, eqPos - 1))
            if Instr(1, key, "token") > 0 or Instr(1, key, "key") > 0 or Instr(1, key, "pass") > 0 or Instr(1, key, "auth") > 0 or Instr(1, key, "secret") > 0
                cleaned.Push(Left(part, eqPos) + "***")
            else
                cleaned.Push(part)
            end if
        else
            cleaned.Push(part)
        end if
    end for
    return base + "?" + cleaned.Join("&")
end function

' Safe print: only prints in debug builds
sub SafeLog(tag as String, message as String)
    #if DEBUG
        print "[" + tag + "] " + message
    #end if
end sub
