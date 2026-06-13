' =============================================================================
' AddPlaylistScene.brs — Add M3U playlist form logic
' =============================================================================
sub init()
    m.nameInput = m.top.FindNode("nameInput")
    m.urlInput = m.top.FindNode("urlInput")
    m.saveBtn = m.top.FindNode("saveBtn")
    m.upgradeBtn = m.top.FindNode("upgradeBtn")
    m.cancelBtn = m.top.FindNode("cancelBtn")
    m.validationMsg = m.top.FindNode("validationMsg")
    m.validationSpinner = m.top.FindNode("validationSpinner")

    m.saveBtn.ObserveField("buttonSelected", "onSave")
    m.upgradeBtn.ObserveField("buttonSelected", "onUpgrade")
    m.cancelBtn.ObserveField("buttonSelected", "onCancel")

    m.validationTask = invalid
    m.isValidating = false
    m.pendingName = ""
    m.pendingUrl = ""

    m.nameInput.SetFocus(true)
end sub

sub focusDefault()
    if TrimString(m.nameInput.text) = ""
        m.nameInput.SetFocus(true)
    else
        m.urlInput.SetFocus(true)
    end if
end sub

sub onSave()
    if m.isValidating then return

    name = TrimString(m.nameInput.text)
    url = TrimString(m.urlInput.text)

    ' Validate name
    if name = ""
        m.validationMsg.text = "Please enter a playlist name."
        m.nameInput.SetFocus(true)
        return
    end if

    ' Validate URL
    if url = ""
        m.validationMsg.text = "Please enter a playlist URL."
        m.urlInput.SetFocus(true)
        return
    end if

    urlLower = LCase(url)
    if not StartsWith(urlLower, "http://") and not StartsWith(urlLower, "https://")
        m.validationMsg.text = "URL must start with http:// or https://"
        m.urlInput.SetFocus(true)
        return
    end if

    ' Additional validation: basic URL format check
    if Instr(1, url, ".") = 0
        m.validationMsg.text = "Please enter a valid URL."
        m.urlInput.SetFocus(true)
        return
    end if

    if PlaylistUrlExists(url)
        m.validationMsg.text = "This playlist URL is already saved."
        m.urlInput.SetFocus(true)
        return
    end if

    if LoadPlaylists().Count() >= GetFreePlaylistLimit() and not IsProFeatureEnabled("unlimited_playlists")
        m.validationMsg.text = "Free plan supports one playlist. Upgrade with Roku Pay for unlimited playlists."
        m.upgradeBtn.SetFocus(true)
        return
    end if

    beginValidation(name, url)
end sub

sub beginValidation(name as String, url as String)
    m.pendingName = name
    m.pendingUrl = url
    m.isValidating = true
    m.validationMsg.color = "#a1a1aa"
    m.validationMsg.text = "Checking playlist before saving..."
    m.validationSpinner.visible = true
    m.saveBtn.text = "Checking..."

    if m.validationTask <> invalid
        m.validationTask.control = "stop"
    end if

    m.validationTask = CreateObject("roSGNode", "FetchPlaylistTask")
    m.validationTask.ObserveField("state", "onValidationComplete")
    m.validationTask.url = url
    m.validationTask.control = "run"
end sub

sub onValidationComplete()
    if m.validationTask = invalid then return

    state = m.validationTask.state
    if state = "loading" then return

    m.isValidating = false
    m.validationSpinner.visible = false
    m.saveBtn.text = "Save Playlist"

    if state = "error"
        m.validationMsg.color = "#ff6b6b"
        m.validationMsg.text = m.validationTask.error
        m.urlInput.SetFocus(true)
        return
    end if

    if state <> "done" then return

    result = m.validationTask.channels
    if result = invalid or result.count = invalid or result.count = 0
        m.validationMsg.color = "#ff6b6b"
        m.validationMsg.text = "No channels found. Check that the URL points to a valid M3U playlist."
        m.urlInput.SetFocus(true)
        return
    end if

    AddPlaylist(m.pendingName, m.pendingUrl)
    m.validationMsg.text = ""

    ' Clear inputs
    m.nameInput.text = ""
    m.urlInput.text = ""

    ' Signal done
    m.top.done = true
end sub

sub onUpgrade()
    if m.validationTask <> invalid
        m.validationTask.control = "stop"
        m.validationTask = invalid
    end if
    m.isValidating = false
    m.validationSpinner.visible = false
    m.saveBtn.text = "Save Playlist"
    m.top.showRokuPay = true
end sub

sub onCancel()
    if m.validationTask <> invalid
        m.validationTask.control = "stop"
        m.validationTask = invalid
    end if
    m.isValidating = false
    m.validationSpinner.visible = false
    m.saveBtn.text = "Save Playlist"
    m.nameInput.text = ""
    m.urlInput.text = ""
    m.validationMsg.text = ""
    m.top.done = true
end sub

function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false

    if key = "back"
        onCancel()
        return true
    end if

    return false
end function
