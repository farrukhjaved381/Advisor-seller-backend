import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ConfigModule } from '@nestjs/config';

export class TestDatabase {
  private mongod: MongoMemoryServer;

  async start(): Promise<string> {
    this.mongod = await MongoMemoryServer.create();
    return this.mongod.getUri();
  }

  async stop(): Promise<void> {
    if (this.mongod) {
      await this.mongod.stop();
    }
  }
}

export const createTestModule = async (imports: any[] = []) => {
  const testDb = new TestDatabase();
  const mongoUri = await testDb.start();

  const module: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '.env.test',
      }),
      MongooseModule.forRoot(mongoUri),
      ...imports,
    ],
  }).compile();

  return { module, testDb };
};
