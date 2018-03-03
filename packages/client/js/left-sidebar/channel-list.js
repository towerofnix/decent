const { h, Component } = require('preact')

class ChannelList extends Component {
  render(props) {
    return <div class='Sidebar-section'>
      <div class='Sidebar-section-title'>
        <h4>Channels</h4>
        <button>+ Create</button>
      </div>

      <div class='Sidebar-list'>
        {props.channels.map((channel, index) => {
          let className = 'Sidebar-list-item --icon-channel'
          if (index === props.activeChannelIndex) className += ' is-active'
          
          return (
            <a
              class={className}
              onclick={() => {props.switchToChannel(index)}}
            >
              {channel.name}
            </a>
          )
        })}
      </div>
    </div>
  }
}

module.exports = ChannelList
