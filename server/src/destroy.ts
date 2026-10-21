import { stopPolling } from './bootstrap'

const destroy = () => {
  stopPolling()
}

export default destroy
