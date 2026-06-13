' =============================================================================
' StreamShōgun — main.brs
' Entry point for the Roku SceneGraph application.
' =============================================================================
sub Main(args as Dynamic)
    screen = CreateObject("roSGScreen")
    m.port = CreateObject("roMessagePort")
    screen.setMessagePort(m.port)

    input = CreateObject("roInput")
    input.SetMessagePort(m.port)

    scene = screen.CreateScene("MainScene")
    screen.show()

    ' Pass deep-link args to scene if present
    if args <> invalid
        if args.contentId <> invalid and args.mediaType <> invalid
            scene.deepLink = {
                contentId: args.contentId,
                mediaType: args.mediaType
            }
        end if
    end if

    while true
        msg = wait(0, m.port)
        msgType = type(msg)
        if msgType = "roSGScreenEvent"
            if msg.isScreenClosed() then return
        else if msgType = "roInputEvent"
            if msg.IsInput()
                info = msg.GetInfo()
                if info <> invalid and info.contentId <> invalid and info.mediaType <> invalid
                    source = "input"
                    if info.source <> invalid then source = info.source
                    scene.deepLink = {
                        contentId: info.contentId,
                        mediaType: info.mediaType,
                        source: source
                    }
                end if
            end if
        end if
    end while
end sub
