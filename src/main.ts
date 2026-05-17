import './styles/main.css'
import { events } from './core/EventBus'
import { logger } from './core/Logger'
import { renderApp } from './core/App'

document.addEventListener('DOMContentLoaded', () => {
  renderApp()
  logger.info('system', 'Nova v1.0 ready')

  events.on('page:changed', (page) => {
    logger.info('nav', `Page: ${page}`)
  })
})
