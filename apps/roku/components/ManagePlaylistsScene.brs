' =============================================================================
' ManagePlaylistsScene.brs — Remote-friendly playlist manager
' =============================================================================
sub init()
    m.playlistList = m.top.FindNode("playlistList")
    m.actionButtons = m.top.FindNode("actionButtons")
    m.detailTitle = m.top.FindNode("detailTitle")
    m.detailBody = m.top.FindNode("detailBody")
    m.statusText = m.top.FindNode("statusText")

    m.playlistList.ObserveField("itemFocused", "onPlaylistFocused")
    m.playlistList.ObserveField("itemSelected", "onPlaylistSelected")
    m.actionButtons.ObserveField("buttonSelected", "onActionSelected")

    m.playlists = []
    m.pendingRemoveId = ""

    refreshPlaylistList()
    m.playlistList.SetFocus(true)
end sub

sub focusDefault()
    m.playlistList.SetFocus(true)
end sub

sub refreshPlaylistList()
    m.playlists = LoadPlaylists()
    content = CreateObject("roSGNode", "ContentNode")

    if m.playlists.Count() = 0
        item = content.CreateChild("ContentNode")
        item.title = "No playlists saved"
    else
        for each playlist in m.playlists
            item = content.CreateChild("ContentNode")
            item.title = playlist.name
        end for
    end if

    m.playlistList.content = content
    m.pendingRemoveId = ""
    m.statusText.text = ""
    showPlaylistDetails(0)
end sub

sub onPlaylistFocused()
    m.pendingRemoveId = ""
    m.statusText.text = ""
    showPlaylistDetails(m.playlistList.itemFocused)
end sub

sub onPlaylistSelected()
    m.actionButtons.SetFocus(true)
end sub

sub showPlaylistDetails(idx as Integer)
    if m.playlists.Count() = 0
        m.detailTitle.text = "No playlists"
        m.detailBody.text = "Add a playlist from the Library tab to manage it here."
        return
    end if

    if idx < 0 or idx >= m.playlists.Count() then idx = 0
    playlist = m.playlists[idx]

    m.detailTitle.text = playlist.name
    text = "Source:" + chr(10)
    text = text + RedactUrl(playlist.url) + chr(10) + chr(10)
    text = text + "Local data linked to this playlist, including favorites, recent entries, resume state, and cached guide/deep-link lookups, will be cleaned up when it is removed." + chr(10) + chr(10)
    text = text + "Playlist ID:" + chr(10)
    text = text + playlist.id
    m.detailBody.text = text
end sub

sub onActionSelected()
    idx = m.actionButtons.buttonSelected
    if idx = 0
        removeFocusedPlaylist()
    else if idx = 1
        closeScene()
    end if
end sub

sub removeFocusedPlaylist()
    if m.playlists.Count() = 0
        closeScene()
        return
    end if

    idx = m.playlistList.itemFocused
    if idx < 0 or idx >= m.playlists.Count() then idx = 0
    playlist = m.playlists[idx]

    if m.pendingRemoveId <> playlist.id
        m.pendingRemoveId = playlist.id
        m.statusText.text = "Press OK on Remove again to delete '" + playlist.name + "'."
        return
    end if

    RemovePlaylist(playlist.id)
    RemoveLibraryMemoryForPlaylist(playlist.id)
    ClearCachedKey("guide_pl_" + playlist.id)
    ClearCachedKey("deeplink_pl_" + playlist.id)

    m.statusText.text = "Removed '" + playlist.name + "'."
    refreshPlaylistList()
    m.playlistList.SetFocus(true)
end sub

sub closeScene()
    m.pendingRemoveId = ""
    m.statusText.text = ""
    m.top.done = true
end sub

function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false

    if key = "back"
        if m.pendingRemoveId <> ""
            m.pendingRemoveId = ""
            m.statusText.text = ""
            return true
        end if
        closeScene()
        return true
    end if

    if key = "right"
        m.actionButtons.SetFocus(true)
        return true
    end if

    if key = "left"
        m.playlistList.SetFocus(true)
        return true
    end if

    return false
end function
