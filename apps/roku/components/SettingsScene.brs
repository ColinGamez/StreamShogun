' =============================================================================
' SettingsScene.brs — Settings, data management, about/legal
' =============================================================================
sub init()
    m.settingsMenu = m.top.FindNode("settingsMenu")
    m.infoTitle = m.top.FindNode("infoTitle")
    m.infoBody = m.top.FindNode("infoBody")
    m.confirmDialog = m.top.FindNode("confirmDialog")

    m.settingsMenu.ObserveField("itemFocused", "onMenuFocused")
    m.settingsMenu.ObserveField("itemSelected", "onMenuSelected")

    ' Menu items (indexed)
    m.menuItems = [
        { title: "StreamShōgun Account", info: "Sign in and refresh Pro entitlement", action: "account" },
        { title: "Pro Features", info: "Review Roku Pro unlocks", action: "pro" },
        { title: "Roku Pay", info: "Purchase or restore Pro with Roku Pay", action: "rokuPay" },
        { title: "EPG Settings", info: "Configure XMLTV source", action: "epg" },
        { title: "Manage Playlists", info: "View and remove saved playlists", action: "playlists" },
        { title: "Viewing Activity", info: "Review favorites, recent channels, and the last played channel", action: "activity" },
        { title: "Diagnostics", info: "Device, cache, and local data details for hardware QA", action: "diagnostics" },
        { title: "Clear EPG Cache", info: "Remove cached EPG data to force a fresh download", action: "clearEpg" },
        { title: "Clear Viewing Activity", info: "Remove favorites, recent channels, and resume state", action: "clearActivity" },
        { title: "Clear All Cache", info: "Remove all cached files (playlists + EPG)", action: "clearCache" },
        { title: "Clear All Data", info: "Remove playlists, EPG settings, account session, and all cached data. This cannot be undone.", action: "clearAll" },
        { title: "About StreamShōgun", info: "App information and version", action: "about" },
        { title: "Legal / Privacy", info: "Content disclaimer and privacy information", action: "legal" },
        { title: "Open Source Licenses", info: "Third-party attributions", action: "licenses" }
    ]
    m.pendingAction = ""

    buildMenu()
    showInfo(0)
end sub

sub focusDefault()
    m.settingsMenu.SetFocus(true)
end sub

sub refreshInfo()
    showInfo(m.settingsMenu.itemFocused)
end sub

' ── Build menu content ──────────────────────────────────────────────
sub buildMenu()
    content = CreateObject("roSGNode", "ContentNode")
    for each item in m.menuItems
        node = content.CreateChild("ContentNode")
        node.title = item.title
    end for
    m.settingsMenu.content = content
end sub

' ── Menu focus → show info panel ────────────────────────────────────
sub onMenuFocused()
    idx = m.settingsMenu.itemFocused
    showInfo(idx)
end sub

sub showInfo(idx as Integer)
    if idx < 0 or idx >= m.menuItems.Count() then return
    item = m.menuItems[idx]
    m.infoTitle.text = item.title

    action = item.action

    if action = "about"
        m.infoBody.text = getAboutText()
    else if action = "legal"
        m.infoBody.text = getLegalText()
    else if action = "licenses"
        m.infoBody.text = getLicenseText()
    else if action = "account"
        m.infoBody.text = getAccountInfo()
    else if action = "pro"
        m.infoBody.text = getProInfo()
    else if action = "rokuPay"
        m.infoBody.text = getRokuPayInfo()
    else if action = "playlists"
        m.infoBody.text = getPlaylistInfo()
    else if action = "activity"
        m.infoBody.text = getActivityInfo()
    else if action = "diagnostics"
        m.infoBody.text = getDiagnosticsInfo()
    else if action = "epg"
        m.infoBody.text = getEpgInfo()
    else
        m.infoBody.text = item.info
    end if
end sub

' ── Menu selection → execute action ─────────────────────────────────
sub onMenuSelected()
    idx = m.settingsMenu.itemSelected
    if idx < 0 or idx >= m.menuItems.Count() then return
    action = m.menuItems[idx].action

    if action = "account"
        m.top.showAccount = true
    else if action = "pro"
        if IsProPlanActive()
            m.top.showAccount = true
        else
            m.top.showRokuPay = true
        end if
    else if action = "rokuPay"
        m.top.showRokuPay = true
    else if action = "epg"
        m.top.showAddEpg = true
    else if action = "playlists"
        if LoadPlaylists().Count() = 0
            m.infoBody.text = "No playlists saved." + chr(10) + chr(10) + "Go to the Library tab and press '+ Add Playlist' to add one."
        else
            m.top.showManagePlaylists = true
        end if
    else if action = "clearEpg"
        ClearEpgSettings()
        ClearCachedKey("epg_data")
        ClearCachedKey("epg_proxy")
        m.infoBody.text = "EPG cache cleared successfully."
    else if action = "clearActivity"
        ClearLibraryMemory()
        m.infoBody.text = "Viewing activity cleared successfully."
    else if action = "clearCache"
        ClearCachedFiles()
        m.infoBody.text = "All cached files have been cleared."
    else if action = "clearAll"
        showClearAllConfirmation()
    else if action = "about"
        showInfo(idx)
    else if action = "legal"
        showInfo(idx)
    else if action = "licenses"
        showInfo(idx)
    end if
end sub

' ── Clear All confirmation ──────────────────────────────────────────
sub showClearAllConfirmation()
    ' Use a simple approach — execute after showing warning
    m.infoBody.text = "WARNING: This will delete all your playlists, EPG settings, account session, preferences, and cached data." + chr(10) + chr(10) + "Press OK again to confirm, or press Back to cancel."
    m.pendingAction = "confirmClearAll"
end sub

sub executeClearAll()
    ClearAllData()
    m.infoBody.text = "All data has been cleared. The app is now in its default state."
    m.pendingAction = ""
    SafeLog("SETTINGS", "All data cleared by user")
end sub

' ── Info text generators ────────────────────────────────────────────
function getAboutText() as String
    di = CreateObject("roDeviceInfo")
    text = "StreamShōgun — Personal Playlist Player" + chr(10)
    text = text + "Version 1.0.19" + chr(10) + chr(10)
    text = text + "A lightweight personal playlist player for Roku." + chr(10)
    text = text + "Add your own M3U/M3U8 playlists and optional XMLTV" + chr(10)
    text = text + "EPG data to browse and watch your channels." + chr(10) + chr(10)
    text = text + "Device: " + di.GetModelDisplayName() + chr(10)
    text = text + "Firmware: " + di.GetVersion() + chr(10)
    text = text + "Display: " + di.GetDisplayType() + chr(10)
    text = text + chr(10) + "streamshogun.com"
    return text
end function

function getLegalText() as String
    text = "CONTENT DISCLAIMER" + chr(10)
    text = text + "==================" + chr(10) + chr(10)
    text = text + "StreamShōgun does not host, provide, or curate any" + chr(10)
    text = text + "media content. This app is a personal playlist player." + chr(10)
    text = text + "All content is user-provided via playlist URLs that" + chr(10)
    text = text + "users add themselves." + chr(10) + chr(10)
    text = text + "Users are solely responsible for ensuring they have" + chr(10)
    text = text + "the legal right to access any content they add to" + chr(10)
    text = text + "this application." + chr(10) + chr(10)
    text = text + "PRIVACY" + chr(10)
    text = text + "=======" + chr(10) + chr(10)
    text = text + "• Playlist URLs and EPG settings are stored locally" + chr(10)
    text = text + "  unless you sign in or use Pro proxy features." + chr(10)
    text = text + "• Account sign-in checks subscription status with" + chr(10)
    text = text + "  the StreamShōgun API." + chr(10)
    text = text + "• No analytics or tracking is performed." + chr(10)
    text = text + "• URLs are redacted in any debug logs." + chr(10) + chr(10)
    text = text + "You can clear all stored data at any time from" + chr(10)
    text = text + "Settings > Clear All Data."
    return text
end function

function getLicenseText() as String
    text = "StreamShōgun is built with BrightScript and SceneGraph." + chr(10) + chr(10)
    text = text + "This application uses no third-party libraries." + chr(10)
    text = text + "All code is original." + chr(10) + chr(10)
    text = text + "Roku and SceneGraph are trademarks of Roku, Inc." + chr(10)
    text = text + "StreamShōgun is not affiliated with Roku, Inc."
    return text
end function

function getPlaylistInfo() as String
    playlists = LoadPlaylists()
    if playlists.Count() = 0
        return "No playlists saved."
    end if
    text = Str(playlists.Count()).Trim() + " playlist(s) saved:" + chr(10) + chr(10)
    for each pl in playlists
        text = text + "• " + pl.name + chr(10)
    end for
    text = text + chr(10) + "Press OK to open the playlist manager."
    return text
end function

function getAccountInfo() as String
    session = LoadAccountSession()
    if session.email = invalid or session.email = ""
        return "No StreamShōgun account signed in." + chr(10) + chr(10) + "Press OK to sign in on this Roku and check Pro entitlement."
    end if

    text = "Signed in: " + session.email + chr(10)
    text = text + "Plan: " + session.plan + chr(10)
    text = text + "Status: " + session.status + chr(10)
    if session.billingInterval <> invalid and session.billingInterval <> ""
        text = text + "Billing: " + session.billingInterval + chr(10)
    end if
    if session.checkedAt > 0
        text = text + "Last checked: " + FormatSettingsTime(session.checkedAt) + chr(10)
    end if
    text = text + chr(10) + "Press OK to refresh or sign out."
    return text
end function

function getProInfo() as String
    text = "ROKU PRO UNLOCKS" + chr(10)
    text = text + "================" + chr(10) + chr(10)
    text = text + "• Unlimited playlist sources" + chr(10)
    text = text + "• Pro EPG proxy for raw .xml.gz guide sources" + chr(10)
    text = text + "• Account-backed entitlement checks" + chr(10) + chr(10)

    if IsProPlanActive()
        text = text + "Pro is active on this Roku." + chr(10) + chr(10)
        text = text + "Press OK to open account status."
    else
        text = text + "Free plan: one playlist source. Sign in with an active Pro account to unlock Roku Pro features." + chr(10) + chr(10)
        text = text + "Press OK to upgrade or restore with Roku Pay."
    end if
    return text
end function

function getRokuPayInfo() as String
    info = CreateObject("roAppInfo")
    monthly = info.GetValue("roku_product_pro_monthly")
    yearly = info.GetValue("roku_product_pro_yearly")
    if monthly = invalid or monthly = "" then monthly = "streamshogun_pro_monthly"
    if yearly = invalid or yearly = "" then yearly = "streamshogun_pro_yearly"

    state = LoadRokuPayState()
    account = LoadAccountSession()
    text = "Roku Pay products:" + chr(10)
    text = text + "Monthly: " + monthly + chr(10)
    text = text + "Yearly: " + yearly + chr(10)
    if account.email <> invalid and account.email <> ""
        text = text + "Account: " + account.email + " (" + account.plan + " / " + account.status + ")" + chr(10) + chr(10)
    else
        text = text + "Account: signed out" + chr(10) + chr(10)
    end if

    if state.purchaseId <> invalid and state.purchaseId <> ""
        text = text + "Stored purchase: " + state.productCode + chr(10)
        text = text + "Validation: " + state.status + chr(10)
        if account.email <> invalid and account.email <> ""
            text = text + "Recovery: ready to validate" + chr(10)
        else
            text = text + "Recovery: sign in from Roku Pay Account, then validation can run" + chr(10)
        end if
        text = text + chr(10) + "Press OK to purchase, validate, restore, or refresh Roku Pay metadata."
    else
        text = text + "No Roku Pay purchase is stored on this device." + chr(10) + chr(10)
        text = text + "Press OK to load plans, purchase, validate, or restore."
    end if
    return text
end function

function getEpgInfo() as String
    settings = LoadEpgSettings()
    if settings.url = ""
        return "No EPG source configured." + chr(10) + chr(10) + "Select this option and press OK to add an XMLTV EPG source."
    end if
    text = "EPG Source: " + RedactUrl(settings.url) + chr(10)
    text = text + "Refresh interval: " + Str(settings.ttlHours).Trim() + " hours" + chr(10)
    if settings.lastFetch > 0
        text = text + "Last fetched: " + FormatSettingsTime(settings.lastFetch)
    else
        text = text + "Not yet fetched"
    end if
    return text
end function

function getActivityInfo() as String
    favorites = LoadFavoriteChannels()
    recent = LoadRecentChannels()
    last = LoadLastChannel()

    text = "Favorites: " + Str(favorites.Count()).Trim() + chr(10)
    text = text + "Recent channels: " + Str(recent.Count()).Trim() + chr(10)
    if last <> invalid and last.name <> invalid
        text = text + "Last played: " + last.name + chr(10)
    else
        text = text + "Last played: none" + chr(10)
    end if

    if favorites.Count() > 0
        text = text + chr(10) + "Favorites:" + chr(10)
        maxFavorites = favorites.Count() - 1
        if maxFavorites > 7 then maxFavorites = 7
        for i = 0 to maxFavorites
            text = text + "• " + favorites[i].name + chr(10)
        end for
    end if

    if recent.Count() > 0
        text = text + chr(10) + "Recent:" + chr(10)
        maxRecent = recent.Count() - 1
        if maxRecent > 7 then maxRecent = 7
        for i = 0 to maxRecent
            text = text + "• " + recent[i].name + chr(10)
        end for
    end if

    return text
end function

function getDiagnosticsInfo() as String
    di = CreateObject("roDeviceInfo")
    playlists = LoadPlaylists()
    favorites = LoadFavoriteChannels()
    recent = LoadRecentChannels()
    settings = LoadEpgSettings()
    account = LoadAccountSession()
    rokuPay = LoadRokuPayState()
    fs = CreateObject("roFileSystem")
    cacheFiles = fs.GetDirectoryListing("tmp:/")

    text = "APP" + chr(10)
    text = text + "Version: 1.0.19" + chr(10)
    text = text + "Build: hardware QA" + chr(10) + chr(10)

    text = text + "DEVICE" + chr(10)
    text = text + "Model: " + di.GetModelDisplayName() + chr(10)
    text = text + "Firmware: " + di.GetVersion() + chr(10)
    text = text + "Display: " + di.GetDisplayType() + chr(10)
    text = text + "Connection: " + di.GetConnectionType() + chr(10) + chr(10)

    text = text + "LOCAL DATA" + chr(10)
    text = text + "Playlists: " + Str(playlists.Count()).Trim() + chr(10)
    text = text + "Favorites: " + Str(favorites.Count()).Trim() + chr(10)
    text = text + "Recent: " + Str(recent.Count()).Trim() + chr(10)
    text = text + "Temp cache files: " + Str(cacheFiles.Count()).Trim() + chr(10)
    if settings.url <> invalid and settings.url <> ""
        text = text + "EPG: configured (" + Str(settings.ttlHours).Trim() + "h TTL)" + chr(10)
    else
        text = text + "EPG: not configured" + chr(10)
    end if
    if account.email <> invalid and account.email <> ""
        text = text + "Account: " + account.plan + " / " + account.status + chr(10)
    else
        text = text + "Account: signed out" + chr(10)
    end if
    if rokuPay.purchaseId <> invalid and rokuPay.purchaseId <> ""
        text = text + "Roku Pay: " + rokuPay.status + " / " + rokuPay.productCode + chr(10)
    else
        text = text + "Roku Pay: no stored purchase" + chr(10)
    end if

    return text
end function

function FormatSettingsTime(epoch as Integer) as String
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

' ── Key handling ────────────────────────────────────────────────────
function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false

    if key = "OK" and m.pendingAction = "confirmClearAll"
        executeClearAll()
        return true
    end if

    if key = "back" and m.pendingAction <> invalid and m.pendingAction <> ""
        m.pendingAction = ""
        showInfo(m.settingsMenu.itemFocused)
        return true
    end if

    return false
end function
