' =============================================================================
' m3u_parser.brs — M3U/M3U8 playlist parser
' =============================================================================
' Parses #EXTM3U format playlists into an array of channel objects.
' Handles: tvg-id, tvg-name, tvg-logo, group-title, stream URL.
' =============================================================================

' Parse an M3U string into an array of channel objects.
' Returns: [ { id, name, logo, group, url, tvgId, tvgName } ]
function ParseM3U(content as String) as Object
    channels = []
    if content = invalid or content = "" then return channels

    lines = content.Split(Chr(10))
    totalLines = lines.Count()

    ' Validate header
    if totalLines = 0 then return channels
    firstLine = TrimString(lines[0])
    if not StartsWith(firstLine, "#EXTM3U")
        SafeLog("M3U", "Warning: Missing #EXTM3U header, attempting parse anyway")
    end if

    ' State machine: look for #EXTINF followed by URL
    currentInfo = invalid

    for i = 0 to totalLines - 1
        line = TrimString(lines[i])

        ' Skip empty lines and comments (except #EXTINF)
        if line = "" then continue for
        if StartsWith(line, "#EXTM3U") then continue for

        if StartsWith(line, "#EXTINF")
            ' Parse the EXTINF line
            currentInfo = ParseExtInf(line)
        else if StartsWith(line, "#")
            ' Other directives — skip
            continue for
        else
            ' This should be a stream URL
            if not StartsWith(LCase(line), "http://") and not StartsWith(LCase(line), "https://")
                ' Not a valid URL, skip
                currentInfo = invalid
                continue for
            end if

            channel = {}
            if currentInfo <> invalid
                channel.name = currentInfo.name
                channel.tvgId = currentInfo.tvgId
                channel.tvgName = currentInfo.tvgName
                channel.logo = currentInfo.logo
                channel.group = currentInfo.group
            else
                ' URL without preceding EXTINF — use URL as name
                channel.name = line
                channel.tvgId = ""
                channel.tvgName = ""
                channel.logo = ""
                channel.group = "Uncategorized"
            end if

            channel.url = line
            channel.id = Str(channels.Count())
            channel.normalizedName = NormalizeName(channel.name)

            channels.Push(channel)
            currentInfo = invalid
        end if
    end for

    SafeLog("M3U", "Parsed " + Str(channels.Count()) + " channels")
    return channels
end function

' Parse a single #EXTINF line.
' Format: #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",Channel Name
function ParseExtInf(line as String) as Object
    info = {
        name: "",
        tvgId: "",
        tvgName: "",
        logo: "",
        group: "Uncategorized"
    }

    ' Find the comma separating attributes from channel name
    ' The comma may appear inside quoted attributes, so find the LAST comma
    ' Actually, the standard format puts the display name after the last comma
    commaPos = 0
    inQuote = false
    for i = 0 to Len(line) - 1
        c = Mid(line, i + 1, 1)
        if c = Chr(34) then inQuote = not inQuote ' toggle on "
        if c = "," and not inQuote then commaPos = i + 1
    end for

    if commaPos > 0
        info.name = TrimString(Mid(line, commaPos + 1))
        attrPart = Left(line, commaPos - 1)
    else
        ' No comma found — try to extract name from end
        attrPart = line
        info.name = "Unknown Channel"
    end if

    ' Extract known attributes using simple pattern matching
    info.tvgId = ExtractAttribute(attrPart, "tvg-id")
    info.tvgName = ExtractAttribute(attrPart, "tvg-name")
    info.logo = ExtractAttribute(attrPart, "tvg-logo")
    groupTitle = ExtractAttribute(attrPart, "group-title")
    if groupTitle <> "" then info.group = groupTitle

    ' If tvgName is empty, use display name
    if info.tvgName = "" then info.tvgName = info.name

    return info
end function

' Extract a quoted attribute value from an EXTINF line.
' Looks for: key="value"
function ExtractAttribute(line as String, key as String) as String
    searchKey = key + "=" + Chr(34)
    attrPos = Instr(1, LCase(line), LCase(searchKey))
    if attrPos = 0 then return ""

    valueStart = attrPos + Len(searchKey)
    quoteEnd = Instr(valueStart, line, Chr(34))
    if quoteEnd = 0 then return ""

    return Mid(line, valueStart, quoteEnd - valueStart)
end function

' Get unique group names from a list of channels.
function GetGroups(channels as Object) as Object
    groups = {}
    groupList = ["All"]
    for each ch in channels
        g = ch.group
        if g <> invalid and g <> "" and not groups.DoesExist(g)
            groups[g] = true
            groupList.Push(g)
        end if
    end for
    return groupList
end function

' Filter channels by group name. "All" returns everything.
function FilterByGroup(channels as Object, group as String) as Object
    if group = "All" or group = "" then return channels
    filtered = []
    for each ch in channels
        if ch.group = group then filtered.Push(ch)
    end for
    return filtered
end function

' Search channels by name (case-insensitive partial match).
function SearchChannels(channels as Object, query as String) as Object
    if query = "" then return channels
    normalizedQuery = LCase(query)
    results = []
    for each ch in channels
        if Instr(1, LCase(ch.name), normalizedQuery) > 0
            results.Push(ch)
        end if
    end for
    return results
end function
