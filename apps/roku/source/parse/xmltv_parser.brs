' =============================================================================
' xmltv_parser.brs — Lightweight XMLTV parser for EPG data
' =============================================================================
' Parses XMLTV XML into channels + programmes.
' Only extracts: channel id/display-name, programme start/stop/title/desc.
' Uses roXMLElement for parsing — memory-safe for moderate-sized files.
' For very large EPGs, we limit to a rolling window (now +/- 12h).
' =============================================================================

' Parse XMLTV content string.
' Returns: { channels: { "id": { id, name } }, programmes: [ { channelId, start, stop, title, desc } ] }
function ParseXMLTV(content as String) as Object
    result = {
        channels: {},
        programmes: []
    }

    if content = invalid or content = "" then return result

    ' Attempt XML parse
    xml = CreateObject("roXMLElement")
    if not xml.Parse(content)
        SafeLog("XMLTV", "Failed to parse XMLTV XML")
        return result
    end if

    ' Calculate time window: now +/- 12 hours
    now = CreateObject("roDateTime")
    nowEpoch = now.AsSeconds()
    windowStart = nowEpoch - (12 * 3600)
    windowEnd = nowEpoch + (12 * 3600)

    ' Parse channels
    xmlChannels = xml.GetNamedElements("channel")
    for each ch in xmlChannels
        channelId = ""
        channelName = ""
        attrs = ch.GetAttributes()
        if attrs.DoesExist("id")
            channelId = attrs["id"]
        end if
        displayNames = ch.GetNamedElements("display-name")
        if displayNames.Count() > 0
            channelName = displayNames[0].GetText()
        end if
        if channelId <> ""
            result.channels[channelId] = {
                id: channelId,
                name: channelName,
                normalizedName: NormalizeName(channelName)
            }
        end if
    end for

    ' Parse programmes (within time window)
    xmlProgrammes = xml.GetNamedElements("programme")
    for each prog in xmlProgrammes
        attrs = prog.GetAttributes()
        channelId = ""
        startStr = ""
        stopStr = ""
        if attrs.DoesExist("channel") then channelId = attrs["channel"]
        if attrs.DoesExist("start") then startStr = attrs["start"]
        if attrs.DoesExist("stop") then stopStr = attrs["stop"]

        ' Parse XMLTV time format: YYYYMMDDHHmmss +HHMM
        startEpoch = ParseXmltvTime(startStr)
        stopEpoch = ParseXmltvTime(stopStr)

        ' Filter to time window
        if startEpoch > 0 and stopEpoch > 0
            if stopEpoch < windowStart or startEpoch > windowEnd
                continue for
            end if
        end if

        title = ""
        desc = ""
        titles = prog.GetNamedElements("title")
        if titles.Count() > 0 then title = titles[0].GetText()
        descs = prog.GetNamedElements("desc")
        if descs.Count() > 0 then desc = descs[0].GetText()

        programme = {
            channelId: channelId,
            start: startEpoch,
            stop: stopEpoch,
            startStr: startStr,
            stopStr: stopStr,
            title: title,
            desc: desc
        }
        result.programmes.Push(programme)
    end for

    SafeLog("XMLTV", "Parsed " + Str(result.channels.Count()) + " channels, " + Str(result.programmes.Count()) + " programmes (windowed)")
    return result
end function

' Parse XMLTV datetime format: "20260304120000 +0000" → epoch seconds
function ParseXmltvTime(timeStr as String) as Integer
    if timeStr = invalid or Len(timeStr) < 14 then return 0

    ' Extract components
    year = Val(Mid(timeStr, 1, 4))
    month = Val(Mid(timeStr, 5, 2))
    day = Val(Mid(timeStr, 7, 2))
    hour = Val(Mid(timeStr, 9, 2))
    minute = Val(Mid(timeStr, 11, 2))
    second = Val(Mid(timeStr, 13, 2))

    ' Parse timezone offset if present
    tzOffset = 0
    spacePos = Instr(1, timeStr, " ")
    if spacePos > 0
        tzPart = TrimString(Mid(timeStr, spacePos + 1))
        if Len(tzPart) >= 5
            sign = Left(tzPart, 1)
            tzHour = Val(Mid(tzPart, 2, 2))
            tzMin = Val(Mid(tzPart, 4, 2))
            tzOffset = (tzHour * 3600) + (tzMin * 60)
            if sign = "-" then tzOffset = -tzOffset
        end if
    end if

    ' Build roDateTime and convert
    dt = CreateObject("roDateTime")
    ' Set to a known epoch, then calculate manually
    ' Roku doesn't have a direct "from components" constructor,
    ' so we use a simplified calculation
    epoch = DateToEpoch(year, month, day, hour, minute, second)
    epoch = epoch - tzOffset ' Convert to UTC
    return epoch
end function

' Convert date components to Unix epoch (UTC)
function DateToEpoch(y as Integer, m as Integer, d as Integer, h as Integer, mi as Integer, s as Integer) as Integer
    ' Days in each month (non-leap)
    monthDays = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

    ' Count days from 1970-01-01
    days = 0

    ' Years
    for yr = 1970 to y - 1
        if IsLeapYear(yr)
            days = days + 366
        else
            days = days + 365
        end if
    end for

    ' Months
    for mo = 1 to m - 1
        days = days + monthDays[mo]
        if mo = 2 and IsLeapYear(y) then days = days + 1
    end for

    ' Days
    days = days + d - 1

    return (days * 86400) + (h * 3600) + (mi * 60) + s
end function

function IsLeapYear(y as Integer) as Boolean
    return (y MOD 4 = 0 and y MOD 100 <> 0) or (y MOD 400 = 0)
end function

' Get programmes for a specific channel, sorted by start time.
function GetProgrammesForChannel(programmes as Object, channelId as String, maxCount as Integer) as Object
    now = CreateObject("roDateTime")
    nowEpoch = now.AsSeconds()
    result = []

    for each prog in programmes
        if prog.channelId = channelId and prog.stop > nowEpoch
            result.Push(prog)
        end if
        if result.Count() >= maxCount then exit for
    end for

    ' Sort by start time (simple bubble sort — list is small)
    for i = 0 to result.Count() - 2
        for j = 0 to result.Count() - i - 2
            if result[j].start > result[j + 1].start
                temp = result[j]
                result[j] = result[j + 1]
                result[j + 1] = temp
            end if
        end for
    end for

    return result
end function

' Match M3U channels to XMLTV channels.
' Returns a map: m3uChannel.id → xmltvChannelId
function MatchChannelsToEpg(m3uChannels as Object, epgChannels as Object) as Object
    matchMap = {}

    for each ch in m3uChannels
        matched = false

        ' Primary match: tvg-id == xmltv channel id
        if ch.tvgId <> invalid and ch.tvgId <> ""
            if epgChannels.DoesExist(ch.tvgId)
                matchMap[ch.id] = ch.tvgId
                matched = true
            end if
        end if

        ' Secondary match: normalized name
        if not matched
            normalizedM3u = NormalizeName(ch.name)
            for each epgKey in epgChannels
                epgCh = epgChannels[epgKey]
                if epgCh.normalizedName = normalizedM3u and normalizedM3u <> ""
                    matchMap[ch.id] = epgKey
                    matched = true
                    exit for
                end if
            end for
        end if
    end for

    SafeLog("XMLTV", "Matched " + Str(matchMap.Count()) + " / " + Str(m3uChannels.Count()) + " channels to EPG")
    return matchMap
end function

' Format epoch time as "HH:MM" for display
function FormatTime(epoch as Integer) as String
    if epoch <= 0 then return ""
    dt = CreateObject("roDateTime")
    dt.FromSeconds(epoch)
    dt.ToLocalTime()
    h = dt.GetHours()
    m = dt.GetMinutes()
    hStr = Right("0" + Str(h).Trim(), 2)
    mStr = Right("0" + Str(m).Trim(), 2)
    return hStr + ":" + mStr
end function
