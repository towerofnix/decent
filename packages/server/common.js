// Unrelated to CommonJS.

const memoize = require('memoizee')
const crypto = require('crypto')
const mrk = require('mrk.js/async')
const { serverPropertiesID, getAllSettings, setSetting } = require('./settings')

module.exports = function makeCommonUtils({db, connectedSocketsMap}) {
  // Symbol which can be passed to some functions to indicate particular
  // behavior coming from the CLI. Sorta hacky? But necessary to keep other
  // code places which use these utility functions from accidentally doing
  // things they shouldn't.
  const fromCLI = Symbol()

  // The olde General Valid Name regex. In the off-chance it's decided that
  // emojis should be allowed (or whatever) in channel/user/etc names, this
  // regex can be updated.
  const isNameValid = name => /^[a-zA-Z0-9_-]+$/g.test(name)

  const asUnixDate = jsDate => jsDate / 1000
  const unixDateNow = () => asUnixDate(Date.now())

  const getUserIDBySessionID = async function(sessionID) {
    if (!sessionID) {
      return null
    }

    const session = await db.sessions.findOne({_id: sessionID})

    if (!session) {
      return null
    }

    return session.userID
  }

  const getUserBySessionID = async function(sessionID) {
    const userID = await getUserIDBySessionID(sessionID)

    if (!userID) {
      return null
    }

    const user = await db.users.findOne({_id: userID})

    if (!user) {
      return null
    }

    return user
  }

  const md5 = string => {
    if (typeof string !== 'string' || string.length === 0) {
      throw new Error('md5() was not passed string')
    }

    return crypto.createHash('md5').update(string).digest('hex')
  }

  const emailToAvatarURL = memoize(email =>
    `https://gravatar.com/avatar/${email ? md5(email) : ''}?d=retro`
  )

  const isUserOnline = function(userID) {
    // Simple logic: a user is online iff there is at least one socket whose
    // session belongs to that user.

    return Array.from(connectedSocketsMap.values())
      .some(socketData => socketData.userID === userID)
  }

  const getPrioritizedRoles = async function(roleOrderSetting = undefined) {
    const allRoles = await db.roles.find({})

    if (roleOrderSetting === undefined) {
      const { rolePrioritizationOrder } = await getAllSettings(db.settings, serverPropertiesID)
      roleOrderSetting = rolePrioritizationOrder
    }

    const prioritizedRoles = roleOrderSetting.map(
      id => allRoles.find(r => r._id === id)
    )

    prioritizedRoles.push(allRoles.find(r => r._id === '_user'))
    prioritizedRoles.push(allRoles.find(r => r._id === '_everyone'))

    return prioritizedRoles
  }

  const getUserPermissions = async function(userID, channelID = null, roleOrderSetting = undefined) {
    // Returns the computed permissions of a user. Takes a channel ID for
    // channel-specific permissions, and a "roleOrderSetting" argument for
    // checking what the resulting permissions after reordering roles would
    // be, without actually reordering those roles.

    // TODO: Handle channel ID, for channel-specific permissions.

    const { roleIDs } = await db.users.findOne({_id: userID})
    const prioritizedRoles = await getPrioritizedRoles(roleOrderSetting)
    const userRoles = prioritizedRoles.filter(r => {
      return ['_everyone', '_user', ...roleIDs].includes(r._id)
    })

    const permissions = userRoles.map(r => r.permissions)

    // The order is initially [mostPrioritized, ..., leastPrioritized].
    // If we just pass this to Object.assing, it'll assign leastPrioritized
    // *after* mostPrioritized. That's not what we want; we want
    // mostPrioritized to be applied last (on top). So we reverse the order.
    permissions.reverse()

    return Object.assign(...permissions)
  }

  const addRole = async function(name, permissions, actorUserID) {
    const role = await db.roles.insert({
      name, permissions
    })

    // Also add the role to the role prioritization order!
    // Default to being the most prioritized under the acting user's own
    // highest role (so that they can rearrange it in the priority order).

    const { rolePrioritizationOrder } = await getAllSettings(db.settings, serverPropertiesID)

    if (actorUserID === fromCLI) {
      // If this is coming from the CLI, there is no user whose highest role
      // we would place this new role under. So, place the new role at the top.
      // (This is pretty much only expected to be used for creating the admin
      // role.)
      rolePrioritizationOrder.unshift(role._id);
    } else if (!actorUserID) {
      throw new Error('Expected actor user ID!');
    } else {
      const highestRoleID = await getHighestRoleOfUser(actorUserID)
      const highestRoleIndex = rolePrioritizationOrder.indexOf(highestRoleID)
      rolePrioritizationOrder.splice(highestRoleIndex + 1, 0, role._id)
    }

    await setSetting(
      db.settings, serverPropertiesID,
      'rolePrioritizationOrder', rolePrioritizationOrder
    )

    return role
  }

  const userHasPermission = async function(userID, permissionKey, channelID = null) {
    const permissions = await getUserPermissions(userID, channelID)
    return permissions[permissionKey] === true
  }

  const userHasPermissions = async function(userID, permissionKeyList, channelID = null) {
    // Don't bother calling userHasPermission() because it fetches the permission list
    // each time.
    const permissions = await getUserPermissions(userID, channelID)
    return permissionKeyList.every(key => permissions[key] === true)
  }

  const userHasPermissionsOfRole = async function(userID, roleID, channelID = null) {
    const { permissions } = await db.roles.findOne({_id: roleID})
    const permissionKeys = Object.keys(permissions)
    return await userHasPermissions(userID, permissionKeys, channelID)
  }

  const getHighestRoleOfUser = async function(userID) {
    // Returns the role ID (not the role object) of the user's highest-priority role.
    // Returns null if the user does not have any roles (besides _user and _everyone).
    const { roleIDs } = await db.users.findOne({_id: userID})

    if (roleIDs.length === 0) {
      return null
    }

    const { rolePrioritizationOrder } = await getAllSettings(db.settings, serverPropertiesID)
    return rolePrioritizationOrder.find(id => roleIDs.includes(id))
  }

  const getUnreadMessageCountInChannel = async function(userObj, channelID) {
    let date = 0
    const { lastReadChannelDates } = userObj
    if (lastReadChannelDates) {
      if (channelID in lastReadChannelDates) {
        date = lastReadChannelDates[channelID]
      }
    }

    const cursor = db.messages.ccount({
      dateCreated: {$gt: date},
      channelID
    }).limit(200)
    const count = await cursor.exec()

    return count
  }

  const getOldestUnreadMessageInChannel = async function(userObj, channelID) {
    let date = 0
    const { lastReadChannelDates } = userObj
    if (lastReadChannelDates) {
      if (channelID in lastReadChannelDates) {
        date = lastReadChannelDates[channelID]
      }
    }

    const message = await db.messages.findOne({
      dateCreated: {$gt: date},
      channelID
    })

    return message
  }

  const getMentionsFromMessageContent = async function(text) {
    const { tokens } = await mrk({
      extendPatterns: {
        // We parse code and codeblocks here as well as mentions so we don't see
        // things like `console.log('@florrie')` as having a mention in it.

        code({ read, has }) {
          if(read() === '`') {
            if (read() === '`') return false

            // Eat up every character until another backtick
            let escaped = false, char, n

            while (char = read()) {
              if (char === '\\' && !escaped) escaped = true
              else if (char === '`' && !escaped) return true
              else escaped = false
            }
          }
        },

        codeblock({ read, readUntil, look }, meta) {
          if (read(3) !== '```') return

          let numBackticks = 3
          while (look() === '`') {
            numBackticks++
            read()
          }

          // All characters up to newline following the intial
          // set of backticks represent the language of the code
          let lang = readUntil('\n')
          read()

          // Final fence
          let code = ''
          while (look(numBackticks) !== '`'.repeat(numBackticks)) {
            if (look().length === 0) return false // We've reached the end
            code += read()
          }

          read(numBackticks)
          if (look() !== '\n' && look() !== '') return false

          // Set metadata
          meta({ lang, code })

          return true
        },

        async mention({ read, readUntil }, meta) {
          if (read(2) !== '<@') return false

          const userID = readUntil('>')
          const user = await db.users.findOne({_id: userID})

          if (!user) return false

          meta({userID: userID})

          return read(1) === '>'
        },
      },
    })(text)

    return tokens
      .filter(tok => tok.name === 'mention')
      .map(tok => tok.metadata.userID)
  }

  return {
    fromCLI,
    isNameValid,
    asUnixDate, unixDateNow,
    getUserIDBySessionID, getUserBySessionID,
    getPrioritizedRoles,
    getUserPermissions,
    userHasPermission, userHasPermissions,
    userHasPermissionsOfRole,
    getHighestRoleOfUser,
    addRole,
    md5,
    isUserOnline,
    emailToAvatarURL,
    getUnreadMessageCountInChannel, getOldestUnreadMessageInChannel,
    getMentionsFromMessageContent,
  }
}
