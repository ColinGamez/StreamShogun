' =============================================================================
' AccountScene.brs — StreamShōgun account / Pro entitlement UI
' =============================================================================
sub init()
    m.accountSummary = m.top.FindNode("accountSummary")
    m.apiInput = m.top.FindNode("apiInput")
    m.emailInput = m.top.FindNode("emailInput")
    m.passwordInput = m.top.FindNode("passwordInput")
    m.signInBtn = m.top.FindNode("signInBtn")
    m.refreshBtn = m.top.FindNode("refreshBtn")
    m.rokuPayBtn = m.top.FindNode("rokuPayBtn")
    m.signOutBtn = m.top.FindNode("signOutBtn")
    m.closeBtn = m.top.FindNode("closeBtn")
    m.statusMsg = m.top.FindNode("statusMsg")
    m.busySpinner = m.top.FindNode("busySpinner")

    m.signInBtn.ObserveField("buttonSelected", "onSignIn")
    m.refreshBtn.ObserveField("buttonSelected", "onRefresh")
    m.rokuPayBtn.ObserveField("buttonSelected", "onRokuPay")
    m.signOutBtn.ObserveField("buttonSelected", "onSignOut")
    m.closeBtn.ObserveField("buttonSelected", "onClose")

    m.sessionTask = invalid
    m.isBusy = false

    populate()
end sub

sub focusDefault()
    session = LoadAccountSession()
    payState = LoadRokuPayState()
    if payState.purchaseId <> invalid and payState.purchaseId <> ""
        m.rokuPayBtn.SetFocus(true)
    else if session.email <> invalid and session.email <> "" and session.accessToken <> invalid and session.accessToken <> ""
        m.refreshBtn.SetFocus(true)
    else if m.emailInput.text <> invalid and m.emailInput.text <> ""
        m.passwordInput.SetFocus(true)
    else
        m.emailInput.SetFocus(true)
    end if
end sub

sub populate()
    session = LoadAccountSession()
    m.apiInput.text = session.apiBaseUrl
    m.emailInput.text = session.email
    updateSummary(session)
end sub

sub updateSummary(session as Object)
    if session.email <> invalid and session.email <> ""
        planText = session.plan
        statusText = session.status
        m.accountSummary.text = session.email + " • " + planText + " / " + statusText
    else
        m.accountSummary.text = "Sign in to check Pro entitlements on this Roku."
    end if
end sub

sub onSignIn()
    if m.isBusy then return

    apiBase = NormalizeApiBaseUrl(m.apiInput.text)
    email = LCase(TrimString(m.emailInput.text))
    password = m.passwordInput.text
    if password = invalid then password = ""

    if apiBase = ""
        showError("Enter the StreamShōgun API URL.")
        m.apiInput.SetFocus(true)
        return
    end if
    if email = "" or Instr(1, email, "@") = 0
        showError("Enter your account email.")
        m.emailInput.SetFocus(true)
        return
    end if
    if password = ""
        showError("Enter your account password.")
        m.passwordInput.SetFocus(true)
        return
    end if

    startTask("login", apiBase, email, password)
end sub

sub onRefresh()
    if m.isBusy then return
    startTask("refresh", NormalizeApiBaseUrl(m.apiInput.text), "", "")
end sub

sub startTask(mode as String, apiBase as String, email as String, password as String)
    m.isBusy = true
    m.busySpinner.visible = true
    m.statusMsg.color = "#a1a1aa"
    m.statusMsg.text = IIF(mode = "login", "Signing in...", "Refreshing Pro status...")
    m.signInBtn.text = "Working..."

    if m.sessionTask <> invalid
        m.sessionTask.control = "stop"
    end if

    m.sessionTask = CreateObject("roSGNode", "AccountSessionTask")
    m.sessionTask.ObserveField("state", "onTaskComplete")
    m.sessionTask.mode = mode
    m.sessionTask.apiBaseUrl = apiBase
    m.sessionTask.email = email
    m.sessionTask.password = password
    m.sessionTask.control = "run"
end sub

sub onTaskComplete()
    if m.sessionTask = invalid then return
    state = m.sessionTask.state
    if state = "loading" then return

    m.isBusy = false
    m.busySpinner.visible = false
    m.signInBtn.text = "Sign In"

    if state = "error"
        showError(m.sessionTask.error)
        return
    end if

    if state = "done"
        session = m.sessionTask.session
        updateSummary(session)
        m.passwordInput.text = ""
        if IsProPlanActive()
            m.statusMsg.color = "#7c5cfc"
            m.statusMsg.text = "Pro is active on this Roku."
        else
            m.statusMsg.color = "#a1a1aa"
            payState = LoadRokuPayState()
            if payState.purchaseId <> invalid and payState.purchaseId <> ""
                m.statusMsg.text = "Account connected. Roku Pay purchase found; choose Roku Pay, then Validate."
                m.rokuPayBtn.SetFocus(true)
            else
                m.statusMsg.text = "Account connected. Pro features are locked until this account has an active Pro subscription."
            end if
        end if
    end if
end sub

sub onSignOut()
    if m.isBusy then return
    ClearAccountSession()
    m.passwordInput.text = ""
    m.statusMsg.color = "#a1a1aa"
    m.statusMsg.text = "Signed out on this Roku."
    populate()
end sub

sub onRokuPay()
    stopTask()
    m.top.showRokuPay = true
end sub

sub onClose()
    stopTask()
    m.statusMsg.text = ""
    m.top.done = true
end sub

sub stopTask()
    if m.sessionTask <> invalid
        m.sessionTask.control = "stop"
        m.sessionTask = invalid
    end if
    m.isBusy = false
    m.busySpinner.visible = false
    m.signInBtn.text = "Sign In"
end sub

sub showError(message as String)
    m.statusMsg.color = "#ff6b6b"
    m.statusMsg.text = message
end sub

function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false

    if key = "back"
        onClose()
        return true
    end if

    return false
end function
