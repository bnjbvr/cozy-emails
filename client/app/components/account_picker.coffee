{div, ul, li, span, a, button} = React.DOM

RouterMixin = require '../mixins/router_mixin'

module.exports = React.createClass
    displayName: 'AccountPicker'



    render: ->
        if accounts.length is 1
            @renderNoChoice()
        else
            @renderPicker()

    onChange: ({target: dataset: value: accountID})->
        @props.valueLink.requestChange accountID


    renderNoChoice: ->
        account = @props.accounts.get @props.valueLink.value
        classInput = 'col-sm-8'

        div className: classInput,
            input className: 'form-control', type: "text", disabled: true, value: account.get 'label'


    renderPicker:  ->
        accounts = @props.accounts
        account = accounts.get @props.valueLink.value
        classInput = 'col-sm-3'

        div className: classInput,
            button id: 'compose-from', className: 'btn btn-default dropdown-toggle', type: 'button', 'data-toggle': 'dropdown', null,
                span ref: 'account', account.get 'label'
                span className: 'caret'
            ul className: 'dropdown-menu', role: 'menu',
                for key, account of accounts.toJS() when key isnt @props.valueLink.value
                    li role: 'presentation', key: key, a role: 'menuitem', onClick: @onChange, 'data-value': key, 
                        account.label
            
