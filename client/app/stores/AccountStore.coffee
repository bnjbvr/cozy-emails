Store = require '../libs/flux/store/Store'

{ActionTypes} = require '../constants/AppConstants'

class AccountStore extends Store

    ###
        Initialization.
        Defines private variables here.
    ###

    # Creates an OrderedMap of accounts
    _accounts = Immutable.Sequence window.accounts

        # sort first
        .sort (mb1, mb2) ->
            if mb1.label > mb2.label then return 1
            else if mb1.label < mb2.label then return -1
            else return 0

        # sets account ID as index
        .mapKeys (_, account) -> return account.id

        # makes account object an immutable Map
        .map (account) ->
            return Immutable.Map account
        .toOrderedMap()

    _selectedAccount = null
    _newAccountWaiting = false
    _newAccountError = null

    ###
        Defines here the action handlers.
    ###
    __bindHandlers: (handle) ->

        handle ActionTypes.ADD_ACCOUNT, (account) ->
            account = Immutable.Map account
            _accounts = _accounts.set account.get('id'), account
            @emit 'change'

        handle ActionTypes.SELECT_ACCOUNT, (accountID) ->
            _selectedAccount = _accounts.get(accountID) or null
            @emit 'change'

        handle ActionTypes.NEW_ACCOUNT_WAITING, (payload) ->
            _newAccountWaiting = payload
            @emit 'change'

        handle ActionTypes.NEW_ACCOUNT_ERROR, (error) ->
            _newAccountError = error
            @emit 'change'

        handle ActionTypes.EDIT_ACCOUNT, (account) ->
            account = Immutable.Map account
            _accounts = _accounts.set account.get('id'), account
            _selectedAccount = _accounts.get account.get 'id'
            @emit 'change'

        handle ActionTypes.REMOVE_ACCOUNT, (accountID) ->
            _accounts = _accounts.delete accountID
            _selectedAccount = @getDefault()
            @emit 'change'

    ###
        Public API
    ###
    getAll: -> return _accounts

    getDefault: -> return _accounts.first() or null

    getSelected: -> return _selectedAccount

    getError: -> return _newAccountError

    isWaiting: -> return _newAccountWaiting

module.exports = new AccountStore()
