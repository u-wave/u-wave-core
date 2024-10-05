import { once } from 'events';
import mongoose from 'mongoose';
import delay from 'delay';

const IN_PROGRESS_ERROR = 12586;

export default async function deleteDatabase(url) {
  const mongo = mongoose.createConnection(url);
  await once(mongo, 'connected');

  for (let i = 0; i < 50; i += 1) {
    try {
      await mongo.dropDatabase();
      break;
    } catch (error) {
      if (error.code === IN_PROGRESS_ERROR) {
        console.log('database op in progress...waiting');
        await delay(100);
      } else {
        throw error;
      }
    }
  }

  await mongo.close();
}
