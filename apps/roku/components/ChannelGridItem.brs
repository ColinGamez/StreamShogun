sub init()
    m.bg = m.top.FindNode("bg")
    m.poster = m.top.FindNode("poster")
    m.fallbackLogo = m.top.FindNode("fallbackLogo")
    m.title = m.top.FindNode("title")
    m.group = m.top.FindNode("group")
    m.playHint = m.top.FindNode("playHint")
    m.favoriteBadge = m.top.FindNode("favoriteBadge")
end sub

sub onSizeChanged()
    if m.top.width > 0 then m.bg.width = m.top.width
    if m.top.height > 0 then m.bg.height = m.top.height
end sub

sub onContentChanged()
    content = m.top.itemContent
    if content = invalid then return

    title = IIF(content.title <> invalid and content.title <> "", content.title, "Unknown Channel")
    m.title.text = title
    m.group.text = IIF(content.description <> invalid, content.description, "")
    m.favoriteBadge.visible = (content.shortDescriptionLine2 <> invalid and content.shortDescriptionLine2 = "favorite")

    posterUrl = ""
    if content.hdPosterUrl <> invalid then posterUrl = content.hdPosterUrl
    if posterUrl <> ""
        m.poster.uri = posterUrl
        m.poster.visible = true
        m.fallbackLogo.visible = false
    else
        m.poster.uri = ""
        m.poster.visible = false
        m.fallbackLogo.text = UCase(Left(title, 1))
        m.fallbackLogo.visible = true
    end if
end sub

sub onFocusChanged()
    if m.top.itemHasFocus
        m.bg.color = "#18181b"
        m.playHint.color = "#7c5cfc"
    else
        m.bg.color = "#111114"
        m.playHint.color = "#71717a"
    end if
end sub

function IIF(condition as Boolean, trueVal as Dynamic, falseVal as Dynamic) as Dynamic
    if condition then return trueVal
    return falseVal
end function
