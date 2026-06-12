' =============================================================================
' PlayerScene.brs — HLS / MP4 video playback with overlay controls
' =============================================================================
sub init()
    m.videoPlayer = m.top.FindNode("videoPlayer")
    m.nowPlayingOverlay = m.top.FindNode("nowPlayingOverlay")
    m.channelLogo = m.top.FindNode("channelLogo")
    m.channelName = m.top.FindNode("channelName")
    m.channelGroup = m.top.FindNode("channelGroup")
    m.bufferingLabel = m.top.FindNode("bufferingLabel")
    m.favoriteLabel = m.top.FindNode("favoriteLabel")
    m.errorOverlay = m.top.FindNode("errorOverlay")
    m.errorDetail = m.top.FindNode("errorDetail")

    m.videoPlayer.ObserveField("state", "onPlayerStateChange")

    ' Auto-hide overlay timer
    m.overlayTimer = CreateObject("roSGNode", "Timer")
    m.overlayTimer.duration = 5
    m.overlayTimer.repeat = false
    m.overlayTimer.ObserveField("fire", "hideOverlay")

    m.isPlaying = false
    m.currentIndex = -1
    m.channels = []
    m.currentChannel = invalid
end sub

' ── Channel set → start playback ───────────────────────────────────
sub onChannelSet()
    channel = m.top.channel
    if channel = invalid then return

    SafeLog("PLAYER", "Starting playback: " + RedactUrl(channel.url))
    m.currentChannel = channel
    RecordChannelPlayback(channel)

    if channel.channels <> invalid
        m.channels = channel.channels
    else
        m.channels = [channel]
    end if
    if channel.index <> invalid
        m.currentIndex = channel.index
    else
        m.currentIndex = findChannelIndex(channel)
    end if

    ' Stop any existing playback
    m.videoPlayer.control = "stop"
    m.errorOverlay.visible = false
    m.bufferingLabel.visible = true
    m.bufferingLabel.text = "Loading..."

    ' Set channel info overlay
    m.channelName.text = IIF(channel.name <> invalid, channel.name, "Unknown Channel")
    m.channelGroup.text = getChannelSubtitle(channel)
    if channel.logo <> invalid and channel.logo <> ""
        m.channelLogo.uri = channel.logo
        m.channelLogo.visible = true
        m.channelName.translation = [140, 976]
        m.channelGroup.translation = [140, 1016]
    else
        m.channelLogo.visible = false
        ' Shift name left when no logo
        m.channelName.translation = [60, 976]
        m.channelGroup.translation = [60, 1016]
    end if

    ' Build content node for Video
    content = CreateObject("roSGNode", "ContentNode")
    content.url = channel.url
    content.title = IIF(channel.name <> invalid, channel.name, "Stream")
    content.description = getChannelSubtitle(channel)
    content.hdPosterUrl = IIF(channel.logo <> invalid, channel.logo, "")
    content.streamFormat = detectStreamFormat(channel.url)
    content.live = isLiveStream(channel.url)
    content.contentType = "movie"
    content.contentClassifier = classifyChannel(channel)
    content.programID = getProgramId(channel)
    content.HttpCertificatesFile = "common:/certs/ca-bundle.crt"

    m.videoPlayer.content = content
    m.videoPlayer.control = "play"
    m.videoPlayer.SetFocus(true)
    updateFavoriteLabel()

    ' Show overlay briefly
    showOverlay()
end sub

' ── Detect stream format from URL ──────────────────────────────────
function detectStreamFormat(url as String) as String
    lowerUrl = LCase(url)
    if Instr(1, lowerUrl, ".m3u8") > 0 then return "hls"
    if Instr(1, lowerUrl, ".ts") > 0 then return "hls"
    if Instr(1, lowerUrl, ".mp4") > 0 then return "mp4"
    if Instr(1, lowerUrl, ".mkv") > 0 then return "mkv"
    if Instr(1, lowerUrl, ".mpd") > 0 then return "dash"
    ' Default to HLS for personal playlist streams
    return "hls"
end function

function classifyChannel(channel as Object) as String
    group = ""
    name = ""
    if channel.group <> invalid then group = LCase(channel.group)
    if channel.name <> invalid then name = LCase(channel.name)
    text = group + " " + name

    if Instr(1, text, "sport") > 0 then return "sports"
    if Instr(1, text, "music") > 0 then return "music"
    if Instr(1, text, "news") > 0 then return "news"
    if Instr(1, text, "kids") > 0 or Instr(1, text, "cartoon") > 0 or Instr(1, text, "animation") > 0 then return "animated"
    if Instr(1, text, "movie") > 0 or Instr(1, text, "film") > 0 then return "drama"
    return "reality"
end function

function getProgramId(channel as Object) as String
    if channel.tvgId <> invalid and channel.tvgId <> "" then return channel.tvgId
    if channel.name <> invalid and channel.name <> "" then return "personal:" + channel.name
    return "stream"
end function

function getChannelSubtitle(channel as Object) as String
    group = ""
    playlistName = ""
    if channel.group <> invalid then group = channel.group
    if channel.playlistName <> invalid then playlistName = channel.playlistName

    if playlistName <> ""
        if group <> "" and group <> "Uncategorized"
            return playlistName + " • " + group
        end if
        return playlistName
    end if

    return group
end function

sub updateFavoriteLabel()
    if m.currentChannel <> invalid and IsFavoriteChannel(m.currentChannel)
        m.favoriteLabel.text = "★"
    else
        m.favoriteLabel.text = ""
    end if
end sub

function isLiveStream(url as String) as Boolean
    lowerUrl = LCase(url)
    if Instr(1, lowerUrl, ".mp4") > 0 then return false
    if Instr(1, lowerUrl, ".mkv") > 0 then return false
    return true
end function

function findChannelIndex(channel as Object) as Integer
    if m.channels = invalid then return -1
    for i = 0 to m.channels.Count() - 1
        ch = m.channels[i]
        if ch.url <> invalid and channel.url <> invalid and ch.url = channel.url
            return i
        end if
    end for
    return -1
end function

sub playAtIndex(idx as Integer)
    if m.channels = invalid or m.channels.Count() = 0 then return

    if idx < 0
        idx = m.channels.Count() - 1
    else if idx >= m.channels.Count()
        idx = 0
    end if

    nextChannel = m.channels[idx]
    m.top.channel = {
        name: IIF(nextChannel.name <> invalid, nextChannel.name, "Unknown Channel"),
        url: IIF(nextChannel.url <> invalid, nextChannel.url, ""),
        logo: IIF(nextChannel.logo <> invalid, nextChannel.logo, ""),
        group: IIF(nextChannel.group <> invalid, nextChannel.group, ""),
        tvgId: IIF(nextChannel.tvgId <> invalid, nextChannel.tvgId, ""),
        playlistId: IIF(nextChannel.playlistId <> invalid, nextChannel.playlistId, ""),
        playlistName: IIF(nextChannel.playlistName <> invalid, nextChannel.playlistName, ""),
        playlistIndex: IIF(nextChannel.playlistIndex <> invalid, nextChannel.playlistIndex, -1),
        channelIndex: IIF(nextChannel.channelIndex <> invalid, nextChannel.channelIndex, -1),
        index: idx,
        channels: m.channels
    }
end sub

' ── Player state changes ───────────────────────────────────────────
sub onPlayerStateChange()
    state = m.videoPlayer.state
    SafeLog("PLAYER", "State: " + state)

    if state = "buffering"
        m.bufferingLabel.visible = true
        m.bufferingLabel.text = "Buffering..."
    else if state = "playing"
        m.bufferingLabel.visible = false
        m.isPlaying = true
    else if state = "error"
        m.isPlaying = false
        showError()
    else if state = "finished"
        m.isPlaying = false
        m.top.done = true
    else if state = "stopped"
        m.isPlaying = false
    end if
end sub

' ── Error handling ─────────────────────────────────────────────────
sub showError()
    errCode = m.videoPlayer.errorCode
    errMsg = m.videoPlayer.errorMsg

    detail = "This stream could not be played."
    if errMsg <> invalid and errMsg <> ""
        detail = detail + chr(10) + "Error: " + errMsg
    end if
    if errCode <> invalid and errCode <> 0
        detail = detail + " (code " + Str(errCode).Trim() + ")"
    end if
    detail = detail + chr(10) + chr(10) + "Possible causes:"
    detail = detail + chr(10) + "• The stream URL may be invalid or expired"
    detail = detail + chr(10) + "• The format may not be supported by Roku"
    detail = detail + chr(10) + "• Network connectivity issues"

    m.errorDetail.text = detail
    m.errorOverlay.visible = true
    m.nowPlayingOverlay.visible = false

    SafeLog("PLAYER", "Playback error: " + Str(errCode).Trim() + " " + IIF(errMsg <> invalid, errMsg, ""))
end sub

' ── Overlay show/hide with timer ───────────────────────────────────
sub showOverlay()
    m.nowPlayingOverlay.visible = true
    m.overlayTimer.control = "stop"
    m.overlayTimer.control = "start"
end sub

sub hideOverlay()
    if m.isPlaying
        m.nowPlayingOverlay.visible = false
    end if
end sub

' ── Key handling ────────────────────────────────────────────────────
function onKeyEvent(key as String, press as Boolean) as Boolean
    if not press then return false

    if key = "back"
        ' Stop playback and exit
        m.videoPlayer.control = "stop"
        m.isPlaying = false
        m.top.done = true
        return true
    end if

    if key = "OK" or key = "play"
        if m.errorOverlay.visible
            ' Retry playback
            m.errorOverlay.visible = false
            m.videoPlayer.control = "play"
            return true
        end if
        ' Toggle overlay
        if m.nowPlayingOverlay.visible
            hideOverlay()
        else
            showOverlay()
        end if
        return true
    end if

    if key = "up" or key = "right"
        playAtIndex(m.currentIndex + 1)
        return true
    end if

    if key = "down" or key = "left"
        playAtIndex(m.currentIndex - 1)
        return true
    end if

    if key = "replay"
        if m.currentChannel <> invalid
            ToggleFavoriteChannel(m.currentChannel)
            updateFavoriteLabel()
            showOverlay()
        end if
        return true
    end if

    if key = "pause" or key = "play"
        ' For live streams, pause isn't useful — show overlay instead
        showOverlay()
        return true
    end if

    return false
end function
