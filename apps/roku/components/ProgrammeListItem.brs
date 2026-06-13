sub init()
    m.bg = m.top.FindNode("bg")
    m.accent = m.top.FindNode("accent")
    m.title = m.top.FindNode("title")
    m.desc = m.top.FindNode("desc")
end sub

sub onSizeChanged()
    if m.top.width > 0
        m.bg.width = m.top.width
        m.title.width = m.top.width - 120
        m.desc.width = m.top.width - 120
    end if
    if m.top.height > 0 then m.bg.height = m.top.height
end sub

sub onContentChanged()
    content = m.top.itemContent
    if content = invalid then return

    m.title.text = IIF(content.title <> invalid, content.title, "")
    m.desc.text = IIF(content.description <> invalid, content.description, "")
    m.accent.visible = (content.shortDescriptionLine1 <> invalid and content.shortDescriptionLine1 = "now")
end sub

sub onFocusChanged()
    if m.top.itemHasFocus
        m.bg.opacity = 0.78
        m.title.color = "#7c5cfc"
    else
        m.bg.opacity = 0.45
        m.title.color = "#f4f4f5"
    end if
end sub

function IIF(condition as Boolean, trueVal as Dynamic, falseVal as Dynamic) as Dynamic
    if condition then return trueVal
    return falseVal
end function
