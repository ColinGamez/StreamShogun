' =============================================================================
' normalize.brs — String normalization helpers
' =============================================================================

' Normalize a channel/display name for fuzzy matching.
' Strips non-alphanumeric, lowercases, trims.
function NormalizeName(raw as String) as String
    if raw = invalid or raw = "" then return ""
    out = LCase(raw)
    ' Remove common suffixes/prefixes that vary between m3u and xmltv
    out = out.Replace(" hd", "")
    out = out.Replace(" sd", "")
    out = out.Replace(" fhd", "")
    out = out.Replace(" uhd", "")
    out = out.Replace(" 4k", "")
    ' Strip non-alphanumeric
    cleaned = ""
    for i = 0 to Len(out) - 1
        c = Mid(out, i + 1, 1)
        code = Asc(c)
        if (code >= 48 and code <= 57) or (code >= 97 and code <= 122)
            cleaned = cleaned + c
        end if
    end for
    return cleaned
end function

' Trim whitespace from both ends of a string
function TrimString(s as String) as String
    if s = invalid then return ""
    start = 0
    while start < Len(s)
        c = Mid(s, start + 1, 1)
        if c <> " " and c <> Chr(9) and c <> Chr(10) and c <> Chr(13)
            exit while
        end if
        start++
    end while
    finish = Len(s) - 1
    while finish >= start
        c = Mid(s, finish + 1, 1)
        if c <> " " and c <> Chr(9) and c <> Chr(10) and c <> Chr(13)
            exit while
        end if
        finish--
    end while
    if start > finish then return ""
    return Mid(s, start + 1, finish - start + 1)
end function

' Check if a string starts with a prefix
function StartsWith(s as String, prefix as String) as Boolean
    if Len(s) < Len(prefix) then return false
    return Left(s, Len(prefix)) = prefix
end function

' Check if a string ends with a suffix
function EndsWith(s as String, suffix as String) as Boolean
    if Len(s) < Len(suffix) then return false
    return Right(s, Len(suffix)) = suffix
end function
