' =============================================================================
' MainScene.brs — Tab navigation controller
' =============================================================================
sub init()
    ImportPrivateBootstrapSession()
    m.tabGroup = m.top.FindNode("tabGroup")
    m.libraryScene = m.top.FindNode("libraryScene")
    m.guideScene = m.top.FindNode("guideScene")
    m.settingsScene = m.top.FindNode("settingsScene")
    m.addPlaylistScene = m.top.FindNode("addPlaylistScene")
    m.addEpgScene = m.top.FindNode("addEpgScene")
    m.accountScene = m.top.FindNode("accountScene")
    m.rokuPayScene = m.top.FindNode("rokuPayScene")
    m.managePlaylistsScene = m.top.FindNode("managePlaylistsScene")
    m.playerScene = m.top.FindNode("playerScene")
    m.statusBanner = m.top.FindNode("statusBanner")
    m.statusText = m.top.FindNode("statusText")

    m.tabGroup.ObserveField("buttonSelected", "onTabSelected")
    m.top.ObserveField("deepLink", "onDeepLink")

    ' Forward events from child scenes
    m.libraryScene.ObserveField("showAddPlaylist", "onShowAddPlaylist")
    m.libraryScene.ObserveField("playChannel", "onPlayChannel")
    m.guideScene.ObserveField("showAddEpg", "onShowAddEpg")
    m.guideScene.ObserveField("playChannel", "onPlayChannel")
    m.addPlaylistScene.ObserveField("done", "onAddPlaylistDone")
    m.addPlaylistScene.ObserveField("showRokuPay", "onUpgradeFromAddPlaylist")
    m.addEpgScene.ObserveField("done", "onAddEpgDone")
    m.addEpgScene.ObserveField("showRokuPay", "onUpgradeFromAddEpg")
    m.accountScene.ObserveField("done", "onAccountDone")
    m.accountScene.ObserveField("showRokuPay", "onRokuPayFromAccount")
    m.rokuPayScene.ObserveField("done", "onRokuPayDone")
    m.rokuPayScene.ObserveField("showAccount", "onAccountFromRokuPay")
    m.managePlaylistsScene.ObserveField("done", "onManagePlaylistsDone")
    m.playerScene.ObserveField("done", "onPlayerDone")
    m.settingsScene.ObserveField("showAddEpg", "onShowAddEpg")
    m.settingsScene.ObserveField("showAccount", "onShowAccount")
    m.settingsScene.ObserveField("showRokuPay", "onShowRokuPay")
    m.settingsScene.ObserveField("showManagePlaylists", "onShowManagePlaylists")

    ' Track active overlay
    m.activeOverlay = invalid
    m.activeTab = 0
    m.deepLinkTask = invalid
    m.entitlementTask = invalid
    m.entitlementRefreshReason = ""
    m.entitlementRefreshMinAge = 900

    m.statusTimer = CreateObject("roSGNode", "Timer")
    m.statusTimer.duration = 4
    m.statusTimer.repeat = false
    m.statusTimer.ObserveField("fire", "hideStatus")

    ' Show library by default
    showTab(0)
    m.tabGroup.SetFocus(true)
    startEntitlementRefresh("startup", false)
end sub

sub onTabSelected()
    idx = m.tabGroup.buttonSelected
    showTab(idx)
end sub

sub showTab(idx as Integer)
    m.activeTab = idx
    m.libraryScene.visible = (idx = 0)
    m.guideScene.visible = (idx = 1)
    m.settingsScene.visible = (idx = 2)

    ' Refresh data when switching tabs
    if idx = 0
        m.libraryScene.callFunc("refresh")
    else if idx = 1
        m.guideScene.callFunc("refresh")
    end if
end sub

sub focusActiveContent()
    if m.activeTab = 0
        m.libraryScene.callFunc("focusDefault")
    else if m.activeTab = 1
        m.guideScene.callFunc("focusDefault")
    else if m.activeTab = 2
        m.settingsScene.callFunc("focusDefault")
    end if
end sub

' ── Overlay management ──────────────────────────────────────────────
sub onShowAddPlaylist()
    showOverlay(m.addPlaylistScene)
end sub

sub onShowAddEpg()
    showOverlay(m.addEpgScene)
end sub

sub onShowAccount()
    showOverlay(m.accountScene)
end sub

sub onShowRokuPay()
    m.rokuPayScene.autoValidate = false
    showOverlay(m.rokuPayScene)
end sub

sub onUpgradeFromAddPlaylist()
    m.addPlaylistScene.visible = false
    m.rokuPayScene.autoValidate = false
    showOverlay(m.rokuPayScene)
end sub

sub onUpgradeFromAddEpg()
    m.addEpgScene.visible = false
    m.rokuPayScene.autoValidate = false
    showOverlay(m.rokuPayScene)
end sub

sub onRokuPayFromAccount()
    m.accountScene.visible = false
    m.rokuPayScene.autoValidate = true
    showOverlay(m.rokuPayScene)
end sub

sub onAccountFromRokuPay()
    m.rokuPayScene.visible = false
    showOverlay(m.accountScene)
end sub

sub onShowManagePlaylists()
    showOverlay(m.managePlaylistsScene)
end sub

sub onPlayChannel()
    channel = invalid
    if m.libraryScene.visible and m.libraryScene.playChannel <> invalid
        channel = m.libraryScene.playChannel
    else if m.guideScene.visible and m.guideScene.playChannel <> invalid
        channel = m.guideScene.playChannel
    end if

    if channel <> invalid
        playChannel(channel)
    end if
end sub

sub playChannel(channel as Object)
    if m.activeOverlay <> invalid and m.activeOverlay <> m.playerScene
        m.activeOverlay.visible = false
    end if

    m.activeOverlay = m.playerScene
    m.playerScene.visible = true
    m.playerScene.channel = channel
    m.playerScene.SetFocus(true)
end sub

sub showOverlay(scene as Object)
    m.activeOverlay = scene
    scene.visible = true
    scene.SetFocus(true)
    scene.callFunc("focusDefault")
end sub

sub hideOverlay()
    if m.activeOverlay <> invalid
        m.activeOverlay.visible = false
        m.activeOverlay = invalid
    end if

    if m.activeTab = 0
        m.libraryScene.callFunc("focusDefault")
    else if m.activeTab = 1
        m.guideScene.callFunc("focusDefault")
    else if m.activeTab = 2
        m.settingsScene.callFunc("focusDefault")
    else
        m.tabGroup.SetFocus(true)
    end if
end sub

sub onAddPlaylistDone()
    hideOverlay()
    m.libraryScene.callFunc("refresh")
end sub

sub onAddEpgDone()
    hideOverlay()
    m.guideScene.callFunc("refresh")
end sub

sub onAccountDone()
    hideOverlay()
    m.libraryScene.callFunc("refreshMemory")
    m.settingsScene.callFunc("refreshInfo")
end sub

sub onRokuPayDone()
    hideOverlay()
    m.libraryScene.callFunc("refreshMemory")
    m.settingsScene.callFunc("refreshInfo")
    startEntitlementRefresh("roku_pay", true)
end sub

sub onManagePlaylistsDone()
    hideOverlay()
    m.libraryScene.callFunc("refresh")
    m.settingsScene.callFunc("refreshInfo")
end sub

sub onPlayerDone()
    hideOverlay()
    m.libraryScene.callFunc("refreshMemory")
end sub

' ── Deep linking / input launch ─────────────────────────────────────
sub onDeepLink()
    link = m.top.deepLink
    if link = invalid then return

    contentId = ""
    mediaType = ""
    if link.contentId <> invalid then contentId = link.contentId
    if link.mediaType <> invalid then mediaType = link.mediaType

    if contentId = "" or not isPlayableMediaType(mediaType)
        showStatus("That Roku link is not available for this app.")
        showTab(0)
        return
    end if

    if m.deepLinkTask <> invalid
        m.deepLinkTask.control = "stop"
    end if

    showStatus("Opening linked channel...")
    m.deepLinkTask = CreateObject("roSGNode", "ResolveDeepLinkTask")
    m.deepLinkTask.ObserveField("state", "onDeepLinkResolved")
    m.deepLinkTask.contentId = contentId
    m.deepLinkTask.mediaType = mediaType
    m.deepLinkTask.control = "run"
end sub

function isPlayableMediaType(mediaType as String) as Boolean
    mt = LCase(mediaType)
    return mt = "movie" or mt = "episode" or mt = "season" or mt = "series" or mt = "shortformvideo" or mt = "tvspecial" or mt = "special" or mt = "live"
end function

sub onDeepLinkResolved()
    if m.deepLinkTask = invalid then return

    state = m.deepLinkTask.state
    if state = "loading" then return

    if state = "done" and m.deepLinkTask.channel <> invalid
        hideStatus()
        playChannel(m.deepLinkTask.channel)
    else
        showTab(0)
        showStatus("Linked channel was not found in your saved playlists.")
    end if
end sub

sub showStatus(message as String)
    m.statusText.text = message
    m.statusBanner.visible = true
    m.statusTimer.control = "stop"
    m.statusTimer.control = "start"
end sub

sub hideStatus()
    m.statusBanner.visible = false
end sub

' ── Background account entitlement refresh ─────────────────────────
sub startEntitlementRefresh(reason as String, force as Boolean)
    if m.entitlementTask <> invalid and m.entitlementTask.state = "loading" then return

    session = LoadAccountSession()
    if session.refreshToken = invalid or session.refreshToken = "" then return

    now = CreateObject("roDateTime").AsSeconds()
    checkedAt = IIF(session.checkedAt <> invalid, session.checkedAt, 0)
    if not force and checkedAt > 0 and now - checkedAt < m.entitlementRefreshMinAge then return

    m.entitlementRefreshReason = reason
    m.entitlementTask = CreateObject("roSGNode", "AccountSessionTask")
    m.entitlementTask.ObserveField("state", "onEntitlementRefreshComplete")
    m.entitlementTask.mode = "refresh"
    m.entitlementTask.apiBaseUrl = session.apiBaseUrl
    m.entitlementTask.control = "run"
end sub

sub onEntitlementRefreshComplete()
    if m.entitlementTask = invalid then return

    state = m.entitlementTask.state
    if state = "loading" then return

    reason = m.entitlementRefreshReason
    if state = "done"
        m.libraryScene.callFunc("refreshMemory")
        m.settingsScene.callFunc("refreshInfo")
        if reason <> "startup"
            showStatus("Account entitlement refreshed.")
        end if
    else if state = "error" and reason <> "startup"
        showStatus("Could not refresh account entitlement.")
    end if

    m.entitlementTask = invalid
    m.entitlementRefreshReason = ""
end sub

' ── Back button handling ────────────────────────────────────────────
function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false

    if key = "down" and m.activeOverlay = invalid
        focusActiveContent()
        return true
    end if

    if key = "up" and m.activeOverlay = invalid
        m.tabGroup.SetFocus(true)
        return true
    end if

    if key = "back"
        if m.activeOverlay <> invalid
            hideOverlay()
            return true
        end if
    end if

    return false
end function
