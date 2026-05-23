import { mongoose } from "@typegoose/typegoose";
import { logger } from "../log/logger";
import { EnvVars } from "./environment";

export const connectToMongoDb = async () => {
  try {
    await mongoose.connect(EnvVars.values.DB_URI, {
      maxPoolSize: 10,
      dbName: EnvVars.values.DB_NAME,
    });
    logger.info("DB Connected!");
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
};
