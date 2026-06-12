' =============================================================================
' AddEpgScene.brs — Add / edit / remove XMLTV EPG source
' =============================================================================
sub init()
    m.urlInput = m.top.FindNode("urlInput")
    m.ttlSelector = m.top.FindNode("ttlSelector")
    m.saveBtn = m.top.FindNode("saveBtn")
    m.removeBtn = m.top.FindNode("removeBtn")
    m.upgradeBtn = m.top.FindNode("upgradeBtn")
    m.cancelBtn = m.top.FindNode("cancelBtn")
    m.validationMsg = m.top.FindNode("validationMsg")
    m.validationSpinner = m.top.FindNode("validationSpinner")

    m.saveBtn.ObserveField("buttonSelected", "onSave")
    m.removeBtn.ObserveField("buttonSelected", "onRemove")
    m.upgradeBtn.ObserveField("buttonSelected", "onUpgrade")
    m.cancelBtn.ObserveField("buttonSelected", "onCancel")

    m.validationTask = invalid
    m.isValidating = false
    m.pendingUrl = ""
    m.pendingTtlHours = 6

    ' TTL values mapped to selector indices
    m.ttlValues = [3, 6, 12, 24]

    ' Pre-populate from existing settings
    populateFromSettings()
end sub

sub focusDefault()
    m.urlInput.SetFocus(true)
end sub

' ── Populate fields from existing EPG settings ─────────────────────
sub populateFromSettings()
    settings = LoadEpgSettings()
    if settings.url <> ""
        m.urlInput.text = settings.url
    end if

    ' Select matching TTL button
    ttlIdx = 1 ' Default: 6h
    for i = 0 to m.ttlValues.Count() - 1
        if m.ttlValues[i] = settings.ttlHours
            ttlIdx = i
            exit for
        end if
    end for
    m.ttlSelector.buttonSelected = ttlIdx
end sub

' ── Save ────────────────────────────────────────────────────────────
sub onSave()
    if m.isValidating then return

    url = m.urlInput.text
    if url = invalid then url = ""
    url = TrimString(url)

    ' Validate URL
    if url = ""
        m.validationMsg.text = "Please enter an XMLTV URL."
        m.urlInput.SetFocus(true)
        return
    end if
    urlLower = LCase(url)
    if not StartsWith(urlLower, "http://") and not StartsWith(urlLower, "https://")
        m.validationMsg.text = "URL must start with http:// or https://"
        m.urlInput.SetFocus(true)
        return
    end if
    if Instr(1, url, ".") = 0
        m.validationMsg.text = "URL does not appear to be valid."
        m.urlInput.SetFocus(true)
        return
    end if

    ' Get selected TTL
    ttlIdx = m.ttlSelector.buttonSelected
    if ttlIdx < 0 or ttlIdx >= m.ttlValues.Count()
        ttlIdx = 1
    end if
    ttlHours = m.ttlValues[ttlIdx]

    beginValidation(url, ttlHours)
end sub

sub beginValidation(url as String, ttlHours as Integer)
    m.pendingUrl = url
    m.pendingTtlHours = ttlHours
    m.isValidating = true
    m.validationMsg.color = "#a1a1aa"
    m.validationMsg.text = "Checking EPG source before saving..."
    m.validationSpinner.visible = true
    m.saveBtn.text = "Checking..."

    if m.validationTask <> invalid
        m.validationTask.control = "stop"
    end if

    m.validationTask = CreateObject("roSGNode", "ValidateEpgTask")
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
    m.saveBtn.text = "Save EPG Source"

    if state = "error"
        m.validationMsg.color = "#ff6b6b"
        m.validationMsg.text = m.validationTask.error
        if isProEpgProxyError(m.validationTask.error)
            m.validationMsg.text = m.validationTask.error + " Upgrade with Roku Pay to use the StreamShōgun EPG proxy."
            m.upgradeBtn.SetFocus(true)
        else
            m.urlInput.SetFocus(true)
        end if
        return
    end if

    if state <> "done" then return

    ' Save settings
    settings = {
        url: m.pendingUrl,
        ttlHours: m.pendingTtlHours,
        lastFetch: 0  ' Reset to force re-fetch
    }
    SaveEpgSettings(settings)

    SafeLog("EPG", "EPG source saved: " + RedactUrl(m.pendingUrl) + " TTL=" + Str(m.pendingTtlHours).Trim() + "h")

    m.validationMsg.text = ""
    m.top.done = true
end sub

' ── Upgrade ────────────────────────────────────────────────────────
sub onUpgrade()
    stopValidation()
    m.top.showRokuPay = true
end sub

' ── Remove EPG ──────────────────────────────────────────────────────
sub onRemove()
    stopValidation()
    ClearEpgSettings()
    ClearCachedKey("epg_data")
    ClearCachedKey("epg_proxy")
    m.urlInput.text = ""
    m.validationMsg.text = ""
    SafeLog("EPG", "EPG source removed")
    m.top.done = true
end sub

' ── Cancel ──────────────────────────────────────────────────────────
sub onCancel()
    stopValidation()
    m.validationMsg.text = ""
    m.top.done = true
end sub

sub stopValidation()
    if m.validationTask <> invalid
        m.validationTask.control = "stop"
        m.validationTask = invalid
    end if
    m.isValidating = false
    m.validationSpinner.visible = false
    m.saveBtn.text = "Save EPG Source"
end sub

function isProEpgProxyError(message as String) as Boolean
    if message = invalid then return false
    lower = LCase(message)
    return Instr(1, lower, ".xml.gz") > 0 or Instr(1, lower, "gzip") > 0
end function

' ── Key handling ────────────────────────────────────────────────────
function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false

    if key = "back"
        onCancel()
        return true
    end if

    return false
end function
