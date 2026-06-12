' =============================================================================
' GuideScene.brs — EPG guide: channel list + programme schedule
' =============================================================================
sub init()
    m.emptyState = m.top.FindNode("emptyState")
    m.guideState = m.top.FindNode("guideState")
    m.addEpgBtn = m.top.FindNode("addEpgBtn")
    m.editEpgBtn = m.top.FindNode("editEpgBtn")
    m.epgStatus = m.top.FindNode("epgStatus")
    m.matchCount = m.top.FindNode("matchCount")
    m.channelList = m.top.FindNode("channelList")
    m.programmeList = m.top.FindNode("programmeList")
    m.selectedChannelName = m.top.FindNode("selectedChannelName")
    m.nowPlaying = m.top.FindNode("nowPlaying")
    m.loadingGroup = m.top.FindNode("loadingGroup")
    m.loadingText = m.top.FindNode("loadingText")
    m.errorGroup = m.top.FindNode("errorGroup")
    m.errorMsg = m.top.FindNode("errorMsg")

    m.addEpgBtn.ObserveField("buttonSelected", "onAddEpg")
    m.editEpgBtn.ObserveField("buttonSelected", "onEditEpg")
    m.channelList.ObserveField("itemFocused", "onChannelFocused")
    m.channelList.ObserveField("itemSelected", "onChannelSelected")

    ' State
    m.epgData = invalid
    m.matchedChannels = []     ' Array of { m3uChannel, epgChannelId }
    m.matchMap = {}
    m.allM3uChannels = []
    m.fetchTask = invalid
    m.libraryTask = invalid
end sub

' ── Refresh (called by MainScene on tab switch) ────────────────────
sub refresh()
    settings = LoadEpgSettings()

    if settings.url = "" or settings.url = invalid
        m.emptyState.visible = true
        m.guideState.visible = false
        return
    end if

    m.emptyState.visible = false
    m.guideState.visible = true
    m.loadingGroup.visible = true
    m.loadingText.text = "Loading EPG data..."
    m.errorGroup.visible = false
    m.channelList.content = invalid
    m.programmeList.content = invalid
    m.matchedChannels = []
    m.matchMap = {}
    m.allM3uChannels = []
    m.matchCount.text = ""
    m.selectedChannelName.text = "Loading..."
    m.nowPlaying.text = ""

    ' Status line
    if settings.lastFetch > 0
        dt = CreateObject("roDateTime")
        dt.FromSeconds(settings.lastFetch)
        dt.ToLocalTime()
        m.epgStatus.text = "Last updated: " + FormatTime(settings.lastFetch) + " | TTL: " + Str(settings.ttlHours).Trim() + "h"
    else
        m.epgStatus.text = "First load..."
    end if

    ' Start fetch task
    stopGuideTasks()
    m.fetchTask = CreateObject("roSGNode", "FetchEpgTask")
    m.fetchTask.ObserveField("state", "onEpgFetchComplete")
    m.fetchTask.url = settings.url
    session = LoadAccountSession()
    if IsProFeatureEnabled("epg_proxy") and session.accessToken <> invalid and session.accessToken <> ""
        m.fetchTask.useProxy = true
        m.fetchTask.proxyBaseUrl = session.apiBaseUrl
        m.fetchTask.proxyToken = session.accessToken
    end if
    m.fetchTask.control = "run"
end sub

sub focusDefault()
    settings = LoadEpgSettings()
    if settings.url = "" or settings.url = invalid
        m.addEpgBtn.SetFocus(true)
    else if m.matchedChannels <> invalid and m.matchedChannels.Count() > 0
        m.channelList.SetFocus(true)
    else
        m.editEpgBtn.SetFocus(true)
    end if
end sub

' ── EPG fetch callback ──────────────────────────────────────────────
sub onEpgFetchComplete()
    if m.fetchTask = invalid then return

    state = m.fetchTask.state
    if state = "loading" then return

    if state = "error"
        m.loadingGroup.visible = false
        m.errorGroup.visible = true
        m.errorMsg.text = m.fetchTask.error
        return
    end if

    if state = "done"
        m.epgData = m.fetchTask.epgData
        loadChannelsForGuide()
    end if
end sub

' ── Build channel list matched to EPG data ──────────────────────────
sub loadChannelsForGuide()
    playlists = LoadPlaylists()
    if playlists.Count() = 0
        m.loadingGroup.visible = false
        m.errorGroup.visible = true
        m.errorMsg.text = "Add a playlist before using the programme guide."
        m.matchCount.text = "No playlists loaded. Add a playlist first."
        return
    end if

    m.loadingText.text = "Loading playlist channels..."

    if m.libraryTask <> invalid
        m.libraryTask.control = "stop"
    end if
    m.libraryTask = CreateObject("roSGNode", "FetchLibraryTask")
    m.libraryTask.ObserveField("state", "onLibraryFetchComplete")
    m.libraryTask.selectedIndex = 0
    m.libraryTask.control = "run"
end sub

sub onLibraryFetchComplete()
    if m.libraryTask = invalid then return

    state = m.libraryTask.state
    if state = "loading" then return

    m.loadingGroup.visible = false

    if state = "error"
        m.errorGroup.visible = true
        m.errorMsg.text = m.libraryTask.error
        return
    end if

    if state <> "done" then return

    data = m.libraryTask.channels
    if data = invalid or data.items = invalid or data.items.Count() = 0
        m.errorGroup.visible = true
        m.errorMsg.text = "No channels found in playlists."
        m.matchCount.text = "No channels found in playlists."
        return
    end if

    m.errorGroup.visible = false
    if data.warning <> invalid and data.warning <> ""
        m.errorGroup.visible = true
        m.errorMsg.text = data.warning
    end if

    buildGuideContent(data.items)
end sub

sub buildGuideContent(channels as Object)
    m.allM3uChannels = channels
    normalizeGuideChannelIds()

    ' Match M3U channels to XMLTV EPG
    m.matchMap = MatchChannelsToEpg(m.allM3uChannels, m.epgData.channels)

    ' Build list of matched channels (those with EPG data shown first)
    m.matchedChannels = []
    unmatchedChannels = []
    for each ch in m.allM3uChannels
        if m.matchMap.DoesExist(ch.id)
            m.matchedChannels.Push(ch)
        else
            unmatchedChannels.Push(ch)
        end if
    end for

    ' Append unmatched at end
    for each ch in unmatchedChannels
        m.matchedChannels.Push(ch)
    end for

    m.matchCount.text = Str(m.matchMap.Count()).Trim() + " / " + Str(m.allM3uChannels.Count()).Trim() + " channels matched to EPG"

    ' Populate LabelList
    content = CreateObject("roSGNode", "ContentNode")
    for each ch in m.matchedChannels
        item = content.CreateChild("ContentNode")
        prefix = ""
        if m.matchMap.DoesExist(ch.id) then prefix = "● "
        item.title = prefix + ch.name
    end for
    m.channelList.content = content

    ' Focus first channel
    if m.matchedChannels.Count() > 0
        m.channelList.jumpToItem = 0
        showProgrammesForChannel(0)
    end if
end sub

' ── Channel focus changed → update programme list ───────────────────
sub onChannelFocused()
    idx = m.channelList.itemFocused
    if idx >= 0 and idx < m.matchedChannels.Count()
        showProgrammesForChannel(idx)
    end if
end sub

' ── Show programmes for a specific channel index ───────────────────
sub showProgrammesForChannel(idx as Integer)
    ch = m.matchedChannels[idx]
    m.selectedChannelName.text = ch.name
    m.nowPlaying.text = ""

    ' Clear programme list
    content = CreateObject("roSGNode", "ContentNode")

    if not m.matchMap.DoesExist(ch.id)
        ' No EPG for this channel
        item = content.CreateChild("ContentNode")
        item.title = "No programme data available"
        item.description = "This channel has no matching XMLTV entry."
        m.programmeList.content = content
        return
    end if

    epgChannelId = m.matchMap[ch.id]
    programmes = GetProgrammesForChannel(m.epgData.programmes, epgChannelId, 12)

    if programmes.Count() = 0
        item = content.CreateChild("ContentNode")
        item.title = "No upcoming programmes"
        item.description = "EPG data matched but no future listings found."
        m.programmeList.content = content
        return
    end if

    ' Determine "now playing"
    now = CreateObject("roDateTime")
    nowEpoch = now.AsSeconds()
    nowProgramme = invalid

    for each prog in programmes
        timeRange = FormatTime(prog.start) + " – " + FormatTime(prog.stop)
        item = content.CreateChild("ContentNode")

        if prog.start <= nowEpoch and prog.stop > nowEpoch
            ' Currently airing
            item.title = "▶ NOW: " + prog.title
            item.shortDescriptionLine1 = "now"
            nowProgramme = prog
        else
            item.title = timeRange + "  " + prog.title
            item.shortDescriptionLine1 = ""
        end if

        desc = timeRange
        if prog.desc <> invalid and prog.desc <> ""
            desc = desc + " — " + prog.desc
        end if
        item.description = desc
    end for

    m.programmeList.content = content

    if nowProgramme <> invalid
        m.nowPlaying.text = "Now: " + nowProgramme.title + " (until " + FormatTime(nowProgramme.stop) + ")"
    end if
end sub

' ── Channel selected → play it ──────────────────────────────────────
sub onChannelSelected()
    idx = m.channelList.itemSelected
    if idx >= 0 and idx < m.matchedChannels.Count()
        ch = m.matchedChannels[idx]
        m.top.playChannel = BuildGuidePlaybackPayload(ch, idx, m.matchedChannels)
    end if
end sub

sub normalizeGuideChannelIds()
    for i = 0 to m.allM3uChannels.Count() - 1
        ch = m.allM3uChannels[i]
        if ch.libraryId <> invalid and ch.libraryId <> ""
            ch.id = ch.libraryId
        else if ch.playlistId <> invalid and ch.playlistId <> ""
            ch.id = ch.playlistId + ":" + Str(i).Trim()
        else
            ch.id = "guide:" + Str(i).Trim()
        end if
    end for
end sub

sub stopGuideTasks()
    if m.fetchTask <> invalid
        m.fetchTask.control = "stop"
        m.fetchTask = invalid
    end if
    if m.libraryTask <> invalid
        m.libraryTask.control = "stop"
        m.libraryTask = invalid
    end if
end sub

function BuildGuidePlaybackPayload(channel as Object, index as Integer, channels as Object) as Object
    playable = []
    for each ch in channels
        playable.Push({
            name: IIF(ch.name <> invalid, ch.name, "Unknown Channel"),
            url: IIF(ch.url <> invalid, ch.url, ""),
            logo: IIF(ch.logo <> invalid, ch.logo, ""),
            group: IIF(ch.group <> invalid, ch.group, ""),
            tvgId: IIF(ch.tvgId <> invalid, ch.tvgId, ""),
            playlistId: IIF(ch.playlistId <> invalid, ch.playlistId, ""),
            playlistName: IIF(ch.playlistName <> invalid, ch.playlistName, ""),
            playlistIndex: IIF(ch.playlistIndex <> invalid, ch.playlistIndex, -1),
            channelIndex: IIF(ch.channelIndex <> invalid, ch.channelIndex, -1)
        })
    end for

    return {
        name: IIF(channel.name <> invalid, channel.name, "Unknown Channel"),
        url: IIF(channel.url <> invalid, channel.url, ""),
        logo: IIF(channel.logo <> invalid, channel.logo, ""),
        group: IIF(channel.group <> invalid, channel.group, ""),
        tvgId: IIF(channel.tvgId <> invalid, channel.tvgId, ""),
        playlistId: IIF(channel.playlistId <> invalid, channel.playlistId, ""),
        playlistName: IIF(channel.playlistName <> invalid, channel.playlistName, ""),
        playlistIndex: IIF(channel.playlistIndex <> invalid, channel.playlistIndex, -1),
        channelIndex: IIF(channel.channelIndex <> invalid, channel.channelIndex, -1),
        index: index,
        channels: playable
    }
end function

' ── Button handlers ─────────────────────────────────────────────────
sub onAddEpg()
    m.top.showAddEpg = true
end sub

sub onEditEpg()
    m.top.showAddEpg = true
end sub

' ── Key handling ────────────────────────────────────────────────────
function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false

    ' Options button refreshes EPG data
    if key = "options"
        refresh()
        return true
    end if

    return false
end function
