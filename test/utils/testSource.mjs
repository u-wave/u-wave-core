export default {
  name: 'test-source',
  api: 2,
  async get(context, ids) {
    return ids.map((id) => ({
      sourceID: id,
      artist: `artist ${id}`,
      title: `title ${id}`,
      duration: 60,
      thumbnail: 'https://placedog.net/280',
    }));
  },
  async search() {
    throw new Error('unimplemented');
  },
};
