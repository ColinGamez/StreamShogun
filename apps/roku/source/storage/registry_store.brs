' =============================================================================
' registry_store.brs — Persistent storage via Roku Registry
' =============================================================================
' Stores: playlists (name + url), EPG settings (url + ttl), preferences,
' local viewing activity, and optional StreamShōgun account entitlements.
' All data is user-provided; nothing is pre-populated.
' =============================================================================

' ── Registry section names ──────────────────────────────────────────
function GetRegistrySection(section as String) as Object
    sec = CreateObject("roRegistrySection", section)
    return sec
end function

' ── Playlists ───────────────────────────────────────────────────────
' Stored as JSON array in "playlists" section, key "list"
' Each item: { "id": "uuid", "name": "...", "url": "..." }

function LoadPlaylists() as Object
    sec = GetRegistrySection("playlists")
    raw = sec.Read("list")
    if raw = invalid or raw = ""
        return []
    end if
    parsed = ParseJSON(raw)
    if parsed = invalid then return []
    return parsed
end function

sub SavePlaylists(playlists as Object)
    sec = GetRegistrySection("playlists")
    sec.Write("list", FormatJSON(playlists))
    sec.Flush()
end sub

function GetFreePlaylistLimit() as Integer
    return 1
end function

function AddPlaylist(name as String, url as String) as Object
    playlists = LoadPlaylists()
    item = {
        id: CreateObject("roDeviceInfo").GetRandomUUID(),
        name: name,
        url: url
    }
    playlists.Push(item)
    SavePlaylists(playlists)
    return item
end function

function PlaylistUrlExists(url as String) as Boolean
    normalized = NormalizePlaylistUrlForCompare(url)
    if normalized = "" then return false

    playlists = LoadPlaylists()
    for each playlist in playlists
        if playlist.url <> invalid and NormalizePlaylistUrlForCompare(playlist.url) = normalized
            return true
        end if
    end for
    return false
end function

function NormalizePlaylistUrlForCompare(url as String) as String
    if url = invalid then return ""
    cleaned = LCase(url)

    while Len(cleaned) > 0 and (Right(cleaned, 1) = " " or Right(cleaned, 1) = Chr(9) or Right(cleaned, 1) = Chr(10) or Right(cleaned, 1) = Chr(13))
        cleaned = Left(cleaned, Len(cleaned) - 1)
    end while

    while Len(cleaned) > 0 and (Left(cleaned, 1) = " " or Left(cleaned, 1) = Chr(9) or Left(cleaned, 1) = Chr(10) or Left(cleaned, 1) = Chr(13))
        cleaned = Mid(cleaned, 2)
    end while

    if Right(cleaned, 1) = "/" then cleaned = Left(cleaned, Len(cleaned) - 1)
    return cleaned
end function

sub RemovePlaylist(id as String)
    playlists = LoadPlaylists()
    filtered = []
    for each p in playlists
        if p.id <> id
            filtered.Push(p)
        end if
    end for
    SavePlaylists(filtered)
end sub

' ── Local Library Memory ────────────────────────────────────────────
function LoadFavoriteChannels() as Object
    sec = GetRegistrySection("library")
    raw = sec.Read("favorites")
    if raw = invalid or raw = "" then return []
    parsed = ParseJSON(raw)
    if parsed = invalid then return []
    return parsed
end function

sub SaveFavoriteChannels(channels as Object)
    sec = GetRegistrySection("library")
    sec.Write("favorites", FormatJSON(channels))
    sec.Flush()
end sub

function LoadRecentChannels() as Object
    sec = GetRegistrySection("library")
    raw = sec.Read("recent")
    if raw = invalid or raw = "" then return []
    parsed = ParseJSON(raw)
    if parsed = invalid then return []
    return parsed
end function

sub SaveRecentChannels(channels as Object)
    sec = GetRegistrySection("library")
    sec.Write("recent", FormatJSON(channels))
    sec.Flush()
end sub

function LoadLastChannel() as Dynamic
    sec = GetRegistrySection("library")
    raw = sec.Read("last")
    if raw = invalid or raw = "" then return invalid
    parsed = ParseJSON(raw)
    if parsed = invalid then return invalid
    return parsed
end function

sub SaveLastChannel(channel as Object)
    sec = GetRegistrySection("library")
    sec.Write("last", FormatJSON(StoredChannelFrom(channel)))
    sec.Flush()
end sub

sub RecordChannelPlayback(channel as Object)
    stored = StoredChannelFrom(channel)
    if stored.url = "" then return

    SaveLastChannel(stored)

    existing = LoadRecentChannels()
    updated = [stored]
    for each item in existing
        if item.url <> invalid and item.url <> stored.url and updated.Count() < 24
            updated.Push(item)
        end if
    end for
    SaveRecentChannels(updated)
end sub

function ToggleFavoriteChannel(channel as Object) as Boolean
    stored = StoredChannelFrom(channel)
    if stored.url = "" then return false

    favorites = LoadFavoriteChannels()
    updated = []
    removed = false

    for each item in favorites
        if item.url <> invalid and item.url = stored.url
            removed = true
        else
            updated.Push(item)
        end if
    end for

    if removed
        SaveFavoriteChannels(updated)
        return false
    end if

    updated.Push(stored)
    SaveFavoriteChannels(updated)
    return true
end function

function IsFavoriteChannel(channel as Object) as Boolean
    if channel = invalid or channel.url = invalid or channel.url = "" then return false
    favorites = LoadFavoriteChannels()
    for each item in favorites
        if item.url <> invalid and item.url = channel.url then return true
    end for
    return false
end function

sub ClearLibraryMemory()
    sec = GetRegistrySection("library")
    sec.Delete("favorites")
    sec.Delete("recent")
    sec.Delete("last")
    sec.Flush()
end sub

sub RemoveLibraryMemoryForPlaylist(playlistId as String)
    if playlistId = invalid or playlistId = "" then return

    favorites = LoadFavoriteChannels()
    filteredFavorites = []
    for each item in favorites
        if item.playlistId = invalid or item.playlistId <> playlistId
            filteredFavorites.Push(item)
        end if
    end for
    SaveFavoriteChannels(filteredFavorites)

    recent = LoadRecentChannels()
    filteredRecent = []
    for each item in recent
        if item.playlistId = invalid or item.playlistId <> playlistId
            filteredRecent.Push(item)
        end if
    end for
    SaveRecentChannels(filteredRecent)

    last = LoadLastChannel()
    if last <> invalid and last.playlistId <> invalid and last.playlistId = playlistId
        sec = GetRegistrySection("library")
        sec.Delete("last")
        sec.Flush()
    end if
end sub

function StoredChannelFrom(channel as Object) as Object
    now = CreateObject("roDateTime")
    return {
        name: IIF(channel <> invalid and channel.name <> invalid, channel.name, "Unknown Channel"),
        url: IIF(channel <> invalid and channel.url <> invalid, channel.url, ""),
        logo: IIF(channel <> invalid and channel.logo <> invalid, channel.logo, ""),
        group: IIF(channel <> invalid and channel.group <> invalid, channel.group, ""),
        tvgId: IIF(channel <> invalid and channel.tvgId <> invalid, channel.tvgId, ""),
        playlistId: IIF(channel <> invalid and channel.playlistId <> invalid, channel.playlistId, ""),
        playlistName: IIF(channel <> invalid and channel.playlistName <> invalid, channel.playlistName, ""),
        playlistIndex: IIF(channel <> invalid and channel.playlistIndex <> invalid, channel.playlistIndex, -1),
        channelIndex: IIF(channel <> invalid and channel.channelIndex <> invalid, channel.channelIndex, -1),
        lastPlayed: now.AsSeconds()
    }
end function

' ── EPG Settings ────────────────────────────────────────────────────
' Stored in "epg" section: "url", "ttlHours", "lastFetch" (epoch)

function LoadEpgSettings() as Object
    sec = GetRegistrySection("epg")
    url = sec.Read("url")
    ttl = sec.Read("ttlHours")
    lastFetch = sec.Read("lastFetch")
    return {
        url: IIF(url <> invalid, url, ""),
        ttlHours: IIF(ttl <> invalid and ttl <> "", Val(ttl), 6),
        lastFetch: IIF(lastFetch <> invalid and lastFetch <> "", Val(lastFetch), 0)
    }
end function

sub SaveEpgSettings(settings as Object)
    sec = GetRegistrySection("epg")
    sec.Write("url", IIF(settings.url <> invalid, settings.url, ""))
    sec.Write("ttlHours", Str(settings.ttlHours).Trim())
    sec.Write("lastFetch", Str(settings.lastFetch).Trim())
    sec.Flush()
end sub

sub ClearEpgSettings()
    sec = GetRegistrySection("epg")
    sec.Delete("url")
    sec.Delete("ttlHours")
    sec.Delete("lastFetch")
    sec.Flush()
end sub

' ── StreamShōgun Account / Pro Entitlements ─────────────────────────
function LoadAccountSession() as Object
    sec = GetRegistrySection("account")
    flagsRaw = sec.Read("flags")
    flags = {}
    if flagsRaw <> invalid and flagsRaw <> ""
        parsed = ParseJSON(flagsRaw)
        if parsed <> invalid then flags = parsed
    end if

    apiBase = sec.Read("apiBaseUrl")
    if apiBase = invalid or apiBase = "" then apiBase = "https://api.streamshogun.com"

    email = sec.Read("email")
    accessToken = sec.Read("accessToken")
    refreshToken = sec.Read("refreshToken")
    plan = sec.Read("plan")
    status = sec.Read("status")
    billingInterval = sec.Read("billingInterval")
    currentPeriodEnd = sec.Read("currentPeriodEnd")
    checkedAt = sec.Read("checkedAt")

    return {
        apiBaseUrl: apiBase,
        email: IIF(email <> invalid, email, ""),
        accessToken: IIF(accessToken <> invalid, accessToken, ""),
        refreshToken: IIF(refreshToken <> invalid, refreshToken, ""),
        plan: IIF(plan <> invalid and plan <> "", plan, "FREE"),
        status: IIF(status <> invalid and status <> "", status, "ACTIVE"),
        billingInterval: IIF(billingInterval <> invalid, billingInterval, ""),
        currentPeriodEnd: IIF(currentPeriodEnd <> invalid, currentPeriodEnd, ""),
        checkedAt: IIF(checkedAt <> invalid and checkedAt <> "", Val(checkedAt), 0),
        flags: flags
    }
end function

sub SaveAccountSession(session as Object)
    sec = GetRegistrySection("account")
    sec.Write("apiBaseUrl", IIF(session.apiBaseUrl <> invalid, session.apiBaseUrl, "https://api.streamshogun.com"))
    sec.Write("email", IIF(session.email <> invalid, session.email, ""))
    sec.Write("accessToken", IIF(session.accessToken <> invalid, session.accessToken, ""))
    sec.Write("refreshToken", IIF(session.refreshToken <> invalid, session.refreshToken, ""))
    sec.Write("plan", IIF(session.plan <> invalid, session.plan, "FREE"))
    sec.Write("status", IIF(session.status <> invalid, session.status, "ACTIVE"))
    sec.Write("billingInterval", IIF(session.billingInterval <> invalid, session.billingInterval, ""))
    sec.Write("currentPeriodEnd", IIF(session.currentPeriodEnd <> invalid, session.currentPeriodEnd, ""))
    sec.Write("checkedAt", Str(IIF(session.checkedAt <> invalid, session.checkedAt, 0)).Trim())
    if session.flags <> invalid
        sec.Write("flags", FormatJSON(session.flags))
    else
        sec.Write("flags", "{}")
    end if
    sec.Flush()
end sub

sub ClearAccountSession()
    sec = GetRegistrySection("account")
    keys = sec.GetKeyList()
    for each k in keys
        sec.Delete(k)
    end for
    sec.Flush()
end sub

function HasAccountSession() as Boolean
    session = LoadAccountSession()
    return session.accessToken <> invalid and session.accessToken <> ""
end function

function IsProPlanActive() as Boolean
    session = LoadAccountSession()
    status = UCase(IIF(session.status <> invalid, session.status, ""))
    return session.plan = "PRO" and (status = "ACTIVE" or status = "TRIALING")
end function

function IsProFeatureEnabled(featureKey as String) as Boolean
    session = LoadAccountSession()
    if session.flags <> invalid and session.flags.DoesExist(featureKey)
        return session.flags[featureKey] = true
    end if
    return IsProPlanActive()
end function

' ── Roku Pay Purchase Metadata ──────────────────────────────────────
function LoadRokuPayState() as Object
    sec = GetRegistrySection("roku_pay")
    productCode = sec.Read("productCode")
    purchaseId = sec.Read("purchaseId")
    status = sec.Read("status")
    purchasedAt = sec.Read("purchasedAt")
    lastRestoreAt = sec.Read("lastRestoreAt")
    return {
        productCode: IIF(productCode <> invalid, productCode, ""),
        purchaseId: IIF(purchaseId <> invalid, purchaseId, ""),
        status: IIF(status <> invalid and status <> "", status, "not_checked"),
        purchasedAt: IIF(purchasedAt <> invalid and purchasedAt <> "", Val(purchasedAt), 0),
        lastRestoreAt: IIF(lastRestoreAt <> invalid and lastRestoreAt <> "", Val(lastRestoreAt), 0)
    }
end function

sub SaveRokuPayState(state as Object)
    sec = GetRegistrySection("roku_pay")
    sec.Write("productCode", IIF(state.productCode <> invalid, state.productCode, ""))
    sec.Write("purchaseId", IIF(state.purchaseId <> invalid, state.purchaseId, ""))
    sec.Write("status", IIF(state.status <> invalid, state.status, "not_checked"))
    sec.Write("purchasedAt", Str(IIF(state.purchasedAt <> invalid, state.purchasedAt, 0)).Trim())
    sec.Write("lastRestoreAt", Str(IIF(state.lastRestoreAt <> invalid, state.lastRestoreAt, 0)).Trim())
    sec.Flush()
end sub

sub ClearRokuPayState()
    sec = GetRegistrySection("roku_pay")
    keys = sec.GetKeyList()
    for each k in keys
        sec.Delete(k)
    end for
    sec.Flush()
end sub

' ── Preferences ─────────────────────────────────────────────────────
function LoadPreference(key as String, defaultVal as String) as String
    sec = GetRegistrySection("prefs")
    val = sec.Read(key)
    if val = invalid or val = "" then return defaultVal
    return val
end function

sub SavePreference(key as String, value as String)
    sec = GetRegistrySection("prefs")
    sec.Write(key, value)
    sec.Flush()
end sub

' ── Clear All Data ──────────────────────────────────────────────────
sub ClearAllData()
    sections = ["playlists", "epg", "prefs", "cache", "library", "account", "roku_pay"]
    for each s in sections
        sec = GetRegistrySection(s)
        keys = sec.GetKeyList()
        for each k in keys
            sec.Delete(k)
        end for
        sec.Flush()
    end for
    ' Also clear tmp: cached files
    ClearCachedFiles()
end sub

sub ClearCachedFiles()
    fs = CreateObject("roFileSystem")
    listing = fs.GetDirectoryListing("tmp:/")
    for each f in listing
        fs.Delete("tmp:/" + f)
    end for
end sub

sub ClearCachedKey(key as String)
    if key = invalid or key = "" then return

    fs = CreateObject("roFileSystem")
    fs.Delete("tmp:/" + key + ".cache")
    fs.Delete("tmp:/" + key + ".gz")
    fs.Delete("tmp:/" + key + ".xml")

    sec = GetRegistrySection("cache")
    sec.Delete(key + "_ts")
    sec.Flush()
end sub

' ── IIF helper (BrightScript lacks ternary) ─────────────────────────
function IIF(condition as Boolean, trueVal as Dynamic, falseVal as Dynamic) as Dynamic
    if condition then return trueVal
    return falseVal
end function
