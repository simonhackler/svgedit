/**
 * Browser detection.
 * @module browser
 * @license MIT
 *
 * @copyright 2010 Jeff Schiller, 2010 Alexis Deveria
 */

/**
 * Browser capabilities and detection object.
 * Uses modern feature detection and lazy evaluation patterns.
 */
class BrowserDetector {
  #userAgent = navigator.userAgent
  #cachedResults = new Map()

  /**
   * Detects if the browser is WebKit-based
   * @returns {boolean}
   */
  get isWebkit () {
    if (!this.#cachedResults.has('isWebkit')) {
      this.#cachedResults.set('isWebkit', this.#userAgent.includes('AppleWebKit'))
    }
    return this.#cachedResults.get('isWebkit')
  }

  /**
   * Detects if the browser is Gecko-based
   * @returns {boolean}
   */
  get isGecko () {
    if (!this.#cachedResults.has('isGecko')) {
      this.#cachedResults.set('isGecko', this.#userAgent.includes('Gecko/'))
    }
    return this.#cachedResults.get('isGecko')
  }

  /**
   * Detects if the browser is Chrome
   * @returns {boolean}
   */
  get isChrome () {
    if (!this.#cachedResults.has('isChrome')) {
      this.#cachedResults.set('isChrome', this.#userAgent.includes('Chrome/'))
    }
    return this.#cachedResults.get('isChrome')
  }

  /**
   * Detects if the platform is macOS
   * @returns {boolean}
   */
  get isMac () {
    if (!this.#cachedResults.has('isMac')) {
      this.#cachedResults.set('isMac', this.#userAgent.includes('Macintosh'))
    }
    return this.#cachedResults.get('isMac')
  }
}

// Create singleton instance
const browser = new BrowserDetector()

// Export as functions for backward compatibility
/**
 * @function module:browser.isWebkit
 * @returns {boolean}
 */
export const isWebkit = () => browser.isWebkit

/**
 * @function module:browser.isGecko
 * @returns {boolean}
 */
export const isGecko = () => browser.isGecko

/**
 * @function module:browser.isChrome
 * @returns {boolean}
 */
export const isChrome = () => browser.isChrome

/**
 * @function module:browser.isMac
 * @returns {boolean}
 */
export const isMac = () => browser.isMac

// Export browser instance for direct access
export default browser
