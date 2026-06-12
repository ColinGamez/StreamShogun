' =============================================================================
' LibraryScene.brs — Playlist selector + channel browsing logic
' =============================================================================
sub init()
    m.emptyState = m.top.FindNode("emptyState")
    m.libraryState = m.top.FindNode("libraryState")
    m.addBtn = m.top.FindNode("addBtn")
    m.addBtnLibrary = m.top.FindNode("addBtnLibrary")
    m.resumeBtn = m.top.FindNode("resumeBtn")
    m.playlistSelector = m.top.FindNode("playlistSelector")
    m.groupSelector = m.top.FindNode("groupSelector")
    m.channelGrid = m.top.FindNode("channelGrid")
    m.channelCount = m.top.FindNode("channelCount")
    m.loadingGroup = m.top.FindNode("loadingGroup")
    m.errorGroup = m.top.FindNode("errorGroup")
    m.errorText = m.top.FindNode("errorText")

    m.addBtn.ObserveField("buttonSelected", "onAddPlaylist")
    m.addBtnLibrary.ObserveField("buttonSelected", "onAddPlaylist")
    m.resumeBtn.ObserveField("buttonSelected", "onResumeLast")
    m.playlistSelector.ObserveField("buttonSelected", "onPlaylistSelected")
    m.groupSelector.ObserveField("buttonSelected", "onGroupSelected")
    m.channelGrid.ObserveField("itemSelected", "onChannelSelected")

    ' State
    m.playlists = []
    m.channels = []
    m.filteredChannels = []
    m.groups = ["All"]
    m.selectedGroup = "All"
    m.searchQuery = ""
    m.fetchTask = invalid
    m.favoriteMap = {}
    m.recentUrls = []
    m.lastChannel = invalid
    m.selectedPlaylistIndex = 0

    refresh()
end sub

sub refresh()
    loadLibraryMemory()
    m.playlists = LoadPlaylists()
    if m.playlists.Count() = 0
        m.emptyState.visible = true
        m.libraryState.visible = false
        m.addBtn.SetFocus(true)
    else
        m.emptyState.visible = false
        m.libraryState.visible = true
        updatePlaylistButtons()
        savedIndex = Val(LoadPreference("libraryPlaylistIndex", "0"))
        if savedIndex < 0 or savedIndex > m.playlists.Count() then savedIndex = 0
        m.selectedPlaylistIndex = savedIndex
        m.playlistSelector.buttonSelected = m.selectedPlaylistIndex
        loadPlaylist(m.selectedPlaylistIndex)
    end if
end sub

sub refreshMemory()
    loadLibraryMemory()
    if m.channels <> invalid and m.channels.Count() > 0
        buildGroups()
        applyFilters()
    end if
end sub

sub loadLibraryMemory()
    m.favoriteMap = {}
    favorites = LoadFavoriteChannels()
    for each item in favorites
        if item.url <> invalid and item.url <> "" then m.favoriteMap[item.url] = true
    end for

    m.recentUrls = []
    recent = LoadRecentChannels()
    for each item in recent
        if item.url <> invalid and item.url <> "" then m.recentUrls.Push(item.url)
    end for

    m.lastChannel = LoadLastChannel()
    m.resumeBtn.visible = (m.lastChannel <> invalid and m.lastChannel.url <> invalid and m.lastChannel.url <> "")
end sub

sub focusDefault()
    if m.playlists.Count() = 0
        m.addBtn.SetFocus(true)
    else if m.filteredChannels <> invalid and m.filteredChannels.Count() > 0
        m.channelGrid.SetFocus(true)
    else
        m.playlistSelector.SetFocus(true)
    end if
end sub

sub updatePlaylistButtons()
    names = ["All Playlists"]
    for each p in m.playlists
        names.Push(p.name)
    end for
    m.playlistSelector.buttons = names
end sub

sub onPlaylistSelected()
    idx = m.playlistSelector.buttonSelected
    m.selectedPlaylistIndex = idx
    SavePreference("libraryPlaylistIndex", Str(idx).Trim())
    loadPlaylist(idx)
end sub

sub loadPlaylist(idx as Integer)
    if idx < 0 or idx > m.playlists.Count() then return

    ' Show loading
    m.loadingGroup.visible = true
    m.errorGroup.visible = false
    m.channelGrid.visible = false

    ' Start fetch task
    if m.fetchTask <> invalid
        m.fetchTask.control = "stop"
    end if
    m.fetchTask = CreateObject("roSGNode", "FetchLibraryTask")
    m.fetchTask.ObserveField("state", "onFetchComplete")
    m.fetchTask.selectedIndex = idx
    m.fetchTask.control = "run"
end sub

sub onFetchComplete()
    state = m.fetchTask.state
    m.loadingGroup.visible = false

    if state = "error"
        m.errorGroup.visible = true
        m.errorText.text = m.fetchTask.error
        m.channelGrid.visible = false
        return
    end if

    if state = "done"
        m.errorGroup.visible = false
        data = m.fetchTask.channels
        m.channels = data.items
        buildGroups()
        m.selectedGroup = "All"

        ' Update group buttons
        m.groupSelector.buttons = m.groups

        ' Populate grid
        applyFilters()
        m.channelGrid.visible = true
        if data.warning <> invalid and data.warning <> ""
            m.errorText.text = data.warning
            m.errorGroup.visible = true
        end if
        m.channelGrid.SetFocus(true)
    end if
end sub

sub buildGroups()
    groups = GetGroups(m.channels)
    finalGroups = ["All"]

    if HasFavoriteChannels(m.channels)
        finalGroups.Push("Favorites")
    end if

    if HasRecentChannels(m.channels)
        finalGroups.Push("Recent")
    end if

    for i = 1 to groups.Count() - 1
        finalGroups.Push(groups[i])
    end for

    m.groups = finalGroups
    m.groupSelector.buttons = m.groups
end sub

function HasFavoriteChannels(channels as Object) as Boolean
    for each ch in channels
        if ch.url <> invalid and m.favoriteMap.DoesExist(ch.url) then return true
    end for
    return false
end function

function HasRecentChannels(channels as Object) as Boolean
    for each recentUrl in m.recentUrls
        for each ch in channels
            if ch.url <> invalid and ch.url = recentUrl then return true
        end for
    end for
    return false
end function

sub onGroupSelected()
    idx = m.groupSelector.buttonSelected
    if idx >= 0 and idx < m.groups.Count()
        m.selectedGroup = m.groups[idx]
    else
        m.selectedGroup = "All"
    end if
    applyFilters()
end sub

sub applyFilters()
    if m.selectedGroup = "Favorites"
        filtered = FilterFavoriteChannels(m.channels)
    else if m.selectedGroup = "Recent"
        filtered = FilterRecentChannels(m.channels)
    else
        filtered = FilterByGroup(m.channels, m.selectedGroup)
    end if

    if m.searchQuery <> ""
        filtered = SearchChannels(filtered, m.searchQuery)
    end if
    m.filteredChannels = filtered

    ' Build ContentNode list for the grid
    content = CreateObject("roSGNode", "ContentNode")
    for each ch in m.filteredChannels
        item = content.CreateChild("ContentNode")
        item.title = ch.name
        if ch.logo <> invalid and ch.logo <> ""
            item.hdPosterUrl = ch.logo
        end if
        item.description = GetChannelSubtitle(ch)
        ' Store URL in the shortDescriptionLine1 for easy access
        item.shortDescriptionLine1 = ch.url
        if ch.url <> invalid and m.favoriteMap.DoesExist(ch.url)
            item.shortDescriptionLine2 = "favorite"
        else
            item.shortDescriptionLine2 = ""
        end if
    end for
    m.channelGrid.content = content
    scopeLabel = "channels"
    if m.selectedPlaylistIndex = 0 and m.playlists.Count() > 1
        scopeLabel = "channels across " + Str(m.playlists.Count()).Trim() + " playlists"
    end if
    m.channelCount.text = Str(m.filteredChannels.Count()).Trim() + " " + scopeLabel
end sub

function GetChannelSubtitle(channel as Object) as String
    group = IIF(channel.group <> invalid, channel.group, "")
    playlistName = IIF(channel.playlistName <> invalid, channel.playlistName, "")
    if m.selectedPlaylistIndex = 0 and playlistName <> ""
        if group <> "" and group <> "Uncategorized"
            return playlistName + " • " + group
        end if
        return playlistName
    end if
    return group
end function

function FilterFavoriteChannels(channels as Object) as Object
    result = []
    for each ch in channels
        if ch.url <> invalid and m.favoriteMap.DoesExist(ch.url)
            result.Push(ch)
        end if
    end for
    return result
end function

function FilterRecentChannels(channels as Object) as Object
    result = []
    added = {}
    for each recentUrl in m.recentUrls
        for each ch in channels
            if ch.url <> invalid and ch.url = recentUrl and not added.DoesExist(ch.url)
                result.Push(ch)
                added[ch.url] = true
                exit for
            end if
        end for
    end for
    return result
end function

sub onChannelSelected()
    idx = m.channelGrid.itemSelected
    if idx >= 0 and idx < m.filteredChannels.Count()
        ch = m.filteredChannels[idx]
        m.top.playChannel = BuildPlaybackPayload(ch, idx, m.filteredChannels)
    end if
end sub

function BuildPlaybackPayload(channel as Object, index as Integer, channels as Object) as Object
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

sub onAddPlaylist()
    m.top.showAddPlaylist = true
end sub

sub onResumeLast()
    if m.lastChannel <> invalid and m.lastChannel.url <> invalid and m.lastChannel.url <> ""
        m.top.playChannel = {
            name: IIF(m.lastChannel.name <> invalid, m.lastChannel.name, "Unknown Channel"),
            url: m.lastChannel.url,
            logo: IIF(m.lastChannel.logo <> invalid, m.lastChannel.logo, ""),
            group: IIF(m.lastChannel.group <> invalid, m.lastChannel.group, ""),
            tvgId: IIF(m.lastChannel.tvgId <> invalid, m.lastChannel.tvgId, ""),
            playlistId: IIF(m.lastChannel.playlistId <> invalid, m.lastChannel.playlistId, ""),
            playlistName: IIF(m.lastChannel.playlistName <> invalid, m.lastChannel.playlistName, ""),
            playlistIndex: IIF(m.lastChannel.playlistIndex <> invalid, m.lastChannel.playlistIndex, -1),
            channelIndex: IIF(m.lastChannel.channelIndex <> invalid, m.lastChannel.channelIndex, -1),
            index: 0,
            channels: [m.lastChannel]
        }
    end if
end sub

function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false

    if key = "replay"
        toggleFocusedFavorite()
        return true
    end if

    ' Search with * button or keyboard shortcut
    if key = "options"
        ' Toggle search — for simplicity, use a standard dialog
        showSearchDialog()
        return true
    end if

    return false
end function

sub toggleFocusedFavorite()
    idx = m.channelGrid.itemFocused
    if idx < 0 or idx >= m.filteredChannels.Count() then return

    channel = m.filteredChannels[idx]
    ToggleFavoriteChannel(channel)
    refreshMemory()
end sub

sub showSearchDialog()
    dialog = CreateObject("roSGNode", "StandardKeyboardDialog")
    dialog.title = "Search Channels"
    dialog.text = m.searchQuery
    dialog.buttons = ["Search", "Clear"]
    m.top.GetScene().dialog = dialog
    dialog.ObserveField("buttonSelected", "onSearchDialogButton")
end sub

sub onSearchDialogButton()
    dialog = m.top.GetScene().dialog
    if dialog = invalid then return

    idx = dialog.buttonSelected
    if idx = 0
        m.searchQuery = dialog.text
    else
        m.searchQuery = ""
    end if
    m.top.GetScene().dialog = invalid
    applyFilters()
end sub
