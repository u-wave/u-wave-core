import routes from '../routes/motd.js';

const CONFIG_MOTD = 'u-wave:motd';

class MOTD {
  #uw;

  /**
   * @param {import('../Uwave.js').default} uw
   */
  constructor(uw) {
    this.#uw = uw;

    uw.config.register(CONFIG_MOTD, {
      type: 'object',
      properties: {
        text: { type: 'string', nullable: true },
      },
    });
  }

  /**
   * @returns {Promise<string | null>}
   */
  async get() {
    const config = /** @type {{ text?: string | null } | null} */ (
      await this.#uw.config.get(CONFIG_MOTD)
    );

    return config?.text ?? null;
  }

  /**
   * @param {string|null} motd
   * @returns {Promise<void>}
   */
  async set(motd) {
    await this.#uw.config.set(CONFIG_MOTD, { text: motd });
  }
}

/**
 * @param {import('../Uwave.js').default} uw
 */
async function motdPlugin(uw) {
  uw.motd = new MOTD(uw);
  uw.httpApi.use('/motd', routes());
}

export default motdPlugin;
export { MOTD };
