' =============================================================================
' RokuPayScene.brs — Roku Pay ChannelStore purchase / restore shell
' =============================================================================
sub init()
    m.channelStore = m.top.FindNode("channelStore")
    m.productSummary = m.top.FindNode("productSummary")
    m.actionButtons = m.top.FindNode("actionButtons")
    m.statusMsg = m.top.FindNode("statusMsg")
    m.busySpinner = m.top.FindNode("busySpinner")

    m.actionButtons.ObserveField("buttonSelected", "onActionSelected")
    m.channelStore.ObserveField("catalog", "onCatalog")
    m.channelStore.ObserveField("userData", "onUserData")
    m.channelStore.ObserveField("orderStatus", "onOrderStatus")
    m.channelStore.ObserveField("purchases", "onPurchases")

    info = CreateObject("roAppInfo")
    m.monthlyCode = info.GetValue("roku_product_pro_monthly")
    if m.monthlyCode = invalid or m.monthlyCode = "" then m.monthlyCode = "streamshogun_pro_monthly"
    m.yearlyCode = info.GetValue("roku_product_pro_yearly")
    if m.yearlyCode = invalid or m.yearlyCode = "" then m.yearlyCode = "streamshogun_pro_yearly"

    m.pendingProductCode = ""
    m.pendingOrderAction = ""
    m.validationTask = invalid
    m.products = {}
    m.isBusy = false

    renderSummary()
end sub

sub focusDefault()
    m.actionButtons.SetFocus(true)
    renderSummary()
    if m.top.autoValidate
        m.top.autoValidate = false
        tryAutoValidateStoredPurchase()
    end if
end sub

sub renderSummary()
    state = LoadRokuPayState()
    session = LoadAccountSession()
    text = "Configured products:" + chr(10)
    text = text + "Monthly: " + productLineForCode(m.monthlyCode) + chr(10)
    text = text + "Yearly: " + productLineForCode(m.yearlyCode) + chr(10) + chr(10)

    if session.email <> invalid and session.email <> ""
        text = text + "Account: " + session.email + " • " + session.plan + " / " + session.status + chr(10)
    else
        text = text + "Account: signed out" + chr(10)
    end if

    if state.purchaseId <> invalid and state.purchaseId <> ""
        text = text + "Last purchase: " + state.productCode + chr(10)
        text = text + "Status: " + state.status + chr(10)
    else
        text = text + "No Roku Pay purchase stored on this device."
    end if
    m.productSummary.text = text
end sub

function productLineForCode(code as String) as String
    if m.products.DoesExist(code)
        p = m.products[code]
        label = IIF(p.name <> invalid and p.name <> "", p.name, code)
        if p.cost <> invalid and p.cost <> "" then label = label + " • " + p.cost
        return label
    end if
    return code + " • not loaded"
end function

sub onActionSelected()
    idx = m.actionButtons.buttonSelected
    if idx = 0
        loadCatalog()
    else if idx = 1
        beginPurchase(m.monthlyCode)
    else if idx = 2
        beginPurchase(m.yearlyCode)
    else if idx = 3
        openAccount()
    else if idx = 4
        validateStoredPurchase()
    else if idx = 5
        restorePurchases()
    else if idx = 6
        closeScene()
    end if
end sub

sub loadCatalog()
    setBusy("Loading Roku Pay plans...")
    m.channelStore.command = "getCatalog"
end sub

sub restorePurchases()
    setBusy("Checking Roku Pay purchases...")
    m.channelStore.command = "getAllPurchases"
end sub

sub validateStoredPurchase()
    state = LoadRokuPayState()
    if state.purchaseId = invalid or state.purchaseId = ""
        showInfo("No stored Roku Pay purchase is ready to validate. Restore purchases first.")
        return
    end if

    if state.productCode = invalid or state.productCode = ""
        showInfo("Stored Roku Pay purchase is missing product metadata. Restore purchases to refresh it.")
        return
    end if

    SaveRokuPayState({
        productCode: state.productCode,
        purchaseId: state.purchaseId,
        status: "pending_backend_validation",
        purchasedAt: state.purchasedAt,
        lastRestoreAt: state.lastRestoreAt
    })
    renderSummary()
    beginBackendValidation(state.productCode, state.purchaseId)
end sub

sub tryAutoValidateStoredPurchase()
    if m.isBusy then return
    state = LoadRokuPayState()
    if state.purchaseId = invalid or state.purchaseId = "" then return
    if state.productCode = invalid or state.productCode = "" then return

    if HasAccountSession()
        showInfo("Account connected. Validating stored Roku Pay purchase...")
        validateStoredPurchase()
    else
        showInfo("Roku Pay purchase found. Choose Account to sign in, then return here to validate Pro entitlement.")
    end if
end sub

sub beginPurchase(productCode as String)
    if productCode = invalid or productCode = ""
        showError("Missing Roku Pay product ID.")
        return
    end if

    if m.products.Count() = 0
        loadCatalog()
        m.pendingProductCode = productCode
        return
    end if

    m.pendingProductCode = productCode
    m.pendingOrderAction = orderActionForProduct(productCode)
    setBusy("Opening Roku account information request...")
    m.channelStore.requestedUserData = "email, firstname, lastname"

    info = CreateObject("roSGNode", "ContentNode")
    info.AddFields({ context: "signup" })
    m.channelStore.requestedUserDataInfo = info
    m.channelStore.command = "getUserData"
end sub

sub onCatalog()
    finishBusy()
    catalog = m.channelStore.catalog
    if not isSuccessNode(catalog)
        showError(nodeStatusMessage(catalog, "Could not load Roku Pay catalog."))
        return
    end if

    m.products = {}
    for i = 0 to catalog.GetChildCount() - 1
        p = catalog.GetChild(i)
        if p.code <> invalid and p.code <> ""
            m.products[p.code] = {
                code: p.code,
                name: IIF(p.name <> invalid, p.name, ""),
                cost: IIF(p.cost <> invalid, p.cost, ""),
                productType: IIF(p.productType <> invalid, p.productType, "")
            }
        end if
    end for

    renderSummary()
    showInfo("Roku Pay catalog loaded.")

    if m.pendingProductCode <> invalid and m.pendingProductCode <> ""
        code = m.pendingProductCode
        m.pendingProductCode = ""
        beginPurchase(code)
    end if
end sub

sub onUserData()
    userData = m.channelStore.userData
    if userData = invalid
        finishBusy()
        showError("Roku account information request was cancelled.")
        return
    end if

    productCode = m.pendingProductCode
    if productCode = invalid or productCode = ""
        finishBusy()
        showError("No Roku Pay product was selected.")
        return
    end if

    setBusy(orderBusyMessage(m.pendingOrderAction))
    order = CreateObject("roSGNode", "ContentNode")
    if m.pendingOrderAction <> invalid and m.pendingOrderAction <> ""
        order.AddFields({ action: m.pendingOrderAction })
    end if
    item = order.CreateChild("ContentNode")
    item.AddFields({ code: productCode, qty: 1 })
    m.channelStore.order = order
    m.channelStore.command = "doOrder"
end sub

sub onOrderStatus()
    finishBusy()
    status = m.channelStore.orderStatus
    if not isSuccessNode(status)
        showError(nodeStatusMessage(status, "Roku Pay order was not completed."))
        return
    end if

    purchase = firstPurchaseNode(status)
    purchaseId = ""
    productCode = m.pendingProductCode
    if purchase <> invalid
        if purchase.purchaseId <> invalid then purchaseId = purchase.purchaseId
        if purchase.code <> invalid and purchase.code <> "" then productCode = purchase.code
    end if

    SaveRokuPayState({
        productCode: IIF(productCode <> invalid, productCode, ""),
        purchaseId: purchaseId,
        status: "pending_backend_validation",
        purchasedAt: CreateObject("roDateTime").AsSeconds(),
        lastRestoreAt: 0
    })
    m.pendingProductCode = ""
    m.pendingOrderAction = ""
    renderSummary()
    beginBackendValidation(productCode, purchaseId)
end sub

sub onPurchases()
    finishBusy()
    purchases = m.channelStore.purchases
    if not isSuccessNode(purchases)
        showError(nodeStatusMessage(purchases, "Could not restore Roku Pay purchases."))
        return
    end if

    match = findProPurchase(purchases)
    now = CreateObject("roDateTime").AsSeconds()
    if match = invalid
        state = LoadRokuPayState()
        state.status = "not_found"
        state.lastRestoreAt = now
        SaveRokuPayState(state)
        renderSummary()
        showInfo("No matching Roku Pay Pro purchase was found.")
        return
    end if

    purchaseId = ""
    if match.purchaseId <> invalid then purchaseId = match.purchaseId
    SaveRokuPayState({
        productCode: match.code,
        purchaseId: purchaseId,
        status: "pending_backend_validation",
        purchasedAt: 0,
        lastRestoreAt: now
    })
    renderSummary()
    beginBackendValidation(match.code, purchaseId)
end sub

sub beginBackendValidation(productCode as String, purchaseId as String)
    if purchaseId = invalid or purchaseId = ""
        showInfo("Roku Pay purchase was recorded without a purchase ID. Backend validation cannot run yet.")
        return
    end if

    if not HasAccountSession()
        showInfo("Roku Pay purchase found. Choose Account to sign in, then return here to validate Pro entitlement.")
        return
    end if

    setBusy("Validating Roku Pay purchase...")
    if m.validationTask <> invalid
        m.validationTask.control = "stop"
    end if
    m.validationTask = CreateObject("roSGNode", "ValidateRokuPayTask")
    m.validationTask.ObserveField("state", "onValidationComplete")
    m.validationTask.productCode = productCode
    m.validationTask.purchaseId = purchaseId
    m.validationTask.control = "run"
end sub

sub onValidationComplete()
    if m.validationTask = invalid then return
    state = m.validationTask.state
    if state = "loading" then return

    finishBusy()
    renderSummary()

    if state = "error"
        showError(m.validationTask.error)
        return
    end if

    if state = "done"
        showInfo("Roku Pay purchase validated. Pro is active on this StreamShōgun account.")
    end if
end sub

function findProPurchase(purchases as Object) as Dynamic
    for i = 0 to purchases.GetChildCount() - 1
        p = purchases.GetChild(i)
        if p.code = m.monthlyCode or p.code = m.yearlyCode then return p
    end for
    return invalid
end function

function orderActionForProduct(productCode as String) as String
    state = LoadRokuPayState()
    currentCode = state.productCode
    if currentCode = invalid or currentCode = "" then return ""
    if currentCode = productCode then return ""

    if currentCode = m.monthlyCode and productCode = m.yearlyCode then return "Upgrade"
    if currentCode = m.yearlyCode and productCode = m.monthlyCode then return "Downgrade"
    return ""
end function

function orderBusyMessage(action as String) as String
    if action = "Upgrade" then return "Opening Roku Pay upgrade confirmation..."
    if action = "Downgrade" then return "Opening Roku Pay downgrade confirmation..."
    return "Opening Roku Pay order confirmation..."
end function

function firstPurchaseNode(parent as Object) as Dynamic
    if parent <> invalid and parent.GetChildCount() > 0 then return parent.GetChild(0)
    return invalid
end function

function isSuccessNode(node as Dynamic) as Boolean
    if node = invalid then return false
    if node.status = invalid then return true
    return Val(Str(node.status)) = 1 or Str(node.status).Trim() = "1"
end function

function nodeStatusMessage(node as Dynamic, fallback as String) as String
    if node <> invalid and node.statusMessage <> invalid and node.statusMessage <> ""
        return node.statusMessage
    end if
    return fallback
end function

sub setBusy(message as String)
    m.isBusy = true
    m.busySpinner.visible = true
    m.statusMsg.color = "#a1a1aa"
    m.statusMsg.text = message
end sub

sub finishBusy()
    m.isBusy = false
    m.busySpinner.visible = false
end sub

sub showInfo(message as String)
    m.statusMsg.color = "#a1a1aa"
    m.statusMsg.text = message
end sub

sub showError(message as String)
    finishBusy()
    m.statusMsg.color = "#ff6b6b"
    m.statusMsg.text = message
end sub

sub closeScene()
    m.top.done = true
end sub

sub openAccount()
    if m.validationTask <> invalid
        m.validationTask.control = "stop"
        m.validationTask = invalid
    end if
    finishBusy()
    m.top.showAccount = true
end sub

function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false

    if key = "back"
        closeScene()
        return true
    end if

    return false
end function
