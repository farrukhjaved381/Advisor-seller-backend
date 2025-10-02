import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/users/schemas/user.schema';

describe('Seller-Advisor Platform E2E', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let advisorToken: string;
  let sellerToken: string;
  let advisorUserId: string;
  let sellerUserId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(MongooseModule)
      .useModule(MongooseModule.forRoot(mongoUri))
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongod.stop();
  });

  describe('🔹 1. Authentication Module', () => {
    describe('User Registration', () => {
      it('✅ should register advisor user', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send({
            email: 'advisor@test.com',
            password: 'password123',
            name: 'Test Advisor',
            role: UserRole.ADVISOR,
          })
          .expect(201);

        expect(response.body.user.email).toBe('advisor@test.com');
        expect(response.body.user.role).toBe(UserRole.ADVISOR);
        advisorUserId = response.body.user._id;
      });

      it('✅ should register seller user', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send({
            email: 'seller@test.com',
            password: 'password123',
            name: 'Test Seller',
            role: UserRole.SELLER,
          })
          .expect(201);

        expect(response.body.user.email).toBe('seller@test.com');
        expect(response.body.user.role).toBe(UserRole.SELLER);
        sellerUserId = response.body.user._id;
      });

      it('❌ should reject duplicate email', async () => {
        await request(app.getHttpServer())
          .post('/auth/register')
          .send({
            email: 'advisor@test.com',
            password: 'password123',
            name: 'Duplicate User',
            role: UserRole.ADVISOR,
          })
          .expect(409);
      });
    });

    describe('User Login', () => {
      it('✅ should login advisor', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: 'advisor@test.com',
            password: 'password123',
          })
          .expect(200);

        expect(response.body.accessToken).toBeDefined();
        advisorToken = response.body.accessToken;
      });

      it('✅ should login seller', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: 'seller@test.com',
            password: 'password123',
          })
          .expect(200);

        expect(response.body.accessToken).toBeDefined();
        sellerToken = response.body.accessToken;
      });

      it('❌ should reject wrong password', async () => {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: 'advisor@test.com',
            password: 'wrongpassword',
          })
          .expect(401);
      });
    });

    describe('Protected Routes', () => {
      it('✅ should access protected route with token', async () => {
        await request(app.getHttpServer())
          .get('/auth/profile')
          .set('Authorization', `Bearer ${advisorToken}`)
          .expect(200);
      });

      it('❌ should reject access without token', async () => {
        await request(app.getHttpServer()).get('/auth/profile').expect(401);
      });
    });
  });

  describe('🔹 2. Advisor Module', () => {
    describe('Profile Management', () => {
      it('✅ should create advisor profile', async () => {
        const response = await request(app.getHttpServer())
          .post('/advisors/profile')
          .set('Authorization', `Bearer ${advisorToken}`)
          .send({
            companyName: 'Test Advisory LLC',
            industries: ['Technology', 'Finance'],
            geographies: ['North America', 'Europe'],
            yearsExperience: 15,
            revenueRange: { min: 100000, max: 10000000 },
          })
          .expect(201);

        expect(response.body.companyName).toBe('Test Advisory LLC');
        expect(response.body.isActive).toBe(false); // Not active until payment
      });

      it('❌ should reject missing required fields', async () => {
        await request(app.getHttpServer())
          .post('/advisors/profile')
          .set('Authorization', `Bearer ${advisorToken}`)
          .send({
            companyName: 'Incomplete Profile',
            // Missing required fields
          })
          .expect(400);
      });

      it('❌ should reject duplicate profile', async () => {
        await request(app.getHttpServer())
          .post('/advisors/profile')
          .set('Authorization', `Bearer ${advisorToken}`)
          .send({
            companyName: 'Duplicate Profile',
            industries: ['Technology'],
            geographies: ['North America'],
            yearsExperience: 10,
          })
          .expect(409);
      });

      it('✅ should update advisor profile', async () => {
        const response = await request(app.getHttpServer())
          .patch('/advisors/profile')
          .set('Authorization', `Bearer ${advisorToken}`)
          .send({
            companyName: 'Updated Advisory LLC',
            yearsExperience: 20,
          })
          .expect(200);

        expect(response.body.companyName).toBe('Updated Advisory LLC');
        expect(response.body.yearsExperience).toBe(20);
      });
    });
  });

  describe('🔹 3. Payment Module', () => {
    describe('Coupon Redemption', () => {
      it('✅ should redeem free trial coupon', async () => {
        const response = await request(app.getHttpServer())
          .post('/payment/redeem-coupon')
          .set('Authorization', `Bearer ${advisorToken}`)
          .send({
            code: 'FREETRIAL2025',
          })
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('❌ should reject invalid coupon', async () => {
        await request(app.getHttpServer())
          .post('/payment/redeem-coupon')
          .set('Authorization', `Bearer ${advisorToken}`)
          .send({
            code: 'INVALID_COUPON',
          })
          .expect(404);
      });
    });
  });

  describe('🔹 4. Seller Module', () => {
    describe('Profile Management', () => {
      it('✅ should create seller profile', async () => {
        const response = await request(app.getHttpServer())
          .post('/sellers/profile')
          .set('Authorization', `Bearer ${sellerToken}`)
          .send({
            companyName: 'Test Tech Corp',
            industry: 'Technology',
            geography: 'North America',
            annualRevenue: 5000000,
            description: 'Leading software company',
          })
          .expect(201);

        expect(response.body.companyName).toBe('Test Tech Corp');
        expect(response.body.industry).toBe('Technology');
      });

      it('❌ should reject seller without profile trying to match', async () => {
        // Create new seller without profile
        const newSellerResponse = await request(app.getHttpServer())
          .post('/auth/register')
          .send({
            email: 'newsel@test.com',
            password: 'password123',
            name: 'New Seller',
            role: UserRole.SELLER,
          });

        const loginResponse = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email: 'newsel@test.com',
            password: 'password123',
          });

        await request(app.getHttpServer())
          .get('/sellers/matches')
          .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
          .expect(404);
      });
    });
  });

  describe('🔹 5. Matching Module', () => {
    describe('Seller-Advisor Matching', () => {
      it('✅ should find matching advisors', async () => {
        const response = await request(app.getHttpServer())
          .get('/sellers/matches')
          .set('Authorization', `Bearer ${sellerToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);
        expect(response.body[0]).toHaveProperty('companyName');
        expect(response.body[0]).toHaveProperty('industries');
      });

      it('✅ should get match statistics', async () => {
        const response = await request(app.getHttpServer())
          .get('/sellers/matches/stats')
          .set('Authorization', `Bearer ${sellerToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('totalMatches');
        expect(response.body).toHaveProperty('industries');
        expect(response.body).toHaveProperty('geographies');
      });

      it('✅ should sort matches by experience', async () => {
        const response = await request(app.getHttpServer())
          .get('/sellers/matches?sortBy=years')
          .set('Authorization', `Bearer ${sellerToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });
    });
  });

  describe('🔹 6. Connections Module', () => {
    let matchedAdvisorIds: string[];

    beforeAll(async () => {
      // Get matches first
      const matchesResponse = await request(app.getHttpServer())
        .get('/sellers/matches')
        .set('Authorization', `Bearer ${sellerToken}`);

      matchedAdvisorIds = matchesResponse.body.map(
        (advisor: any) => advisor.id,
      );
    });

    describe('Introduction Service', () => {
      it('✅ should send introduction emails', async () => {
        if (matchedAdvisorIds.length > 0) {
          const response = await request(app.getHttpServer())
            .post('/connections/introduction')
            .set('Authorization', `Bearer ${sellerToken}`)
            .send({
              advisorIds: [matchedAdvisorIds[0]],
            })
            .expect(200);

          expect(response.body.message).toContain('Introduction emails sent');
          expect(response.body.emailsSent).toBeGreaterThan(0);
        }
      });

      it('❌ should reject invalid advisor IDs', async () => {
        await request(app.getHttpServer())
          .post('/connections/introduction')
          .set('Authorization', `Bearer ${sellerToken}`)
          .send({
            advisorIds: ['invalid_id_123'],
          })
          .expect(400);
      });
    });

    describe('Direct Contact List', () => {
      it('✅ should send direct contact list', async () => {
        const response = await request(app.getHttpServer())
          .post('/connections/direct-list')
          .set('Authorization', `Bearer ${sellerToken}`)
          .expect(200);

        expect(response.body.message).toContain('Contact list sent');
        expect(response.body.advisorCount).toBeGreaterThan(0);
      });
    });
  });

  describe('🔹 7. Full User Journey', () => {
    it('✅ should complete end-to-end flow', async () => {
      // 1. Advisor registers and creates profile
      const advisorRegResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'e2e.advisor@test.com',
          password: 'password123',
          name: 'E2E Advisor',
          role: UserRole.ADVISOR,
        })
        .expect(201);

      const advisorLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'e2e.advisor@test.com',
          password: 'password123',
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/advisors/profile')
        .set('Authorization', `Bearer ${advisorLoginResponse.body.accessToken}`)
        .send({
          companyName: 'E2E Advisory',
          industries: ['Healthcare'],
          geographies: ['Asia Pacific'],
          yearsExperience: 12,
          revenueRange: { min: 500000, max: 5000000 },
        })
        .expect(201);

      // 2. Advisor activates via coupon
      await request(app.getHttpServer())
        .post('/payment/redeem-coupon')
        .set('Authorization', `Bearer ${advisorLoginResponse.body.accessToken}`)
        .send({ code: 'FREETRIAL2025' })
        .expect(200);

      // 3. Seller registers and creates profile
      const sellerRegResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'e2e.seller@test.com',
          password: 'password123',
          name: 'E2E Seller',
          role: UserRole.SELLER,
        })
        .expect(201);

      const sellerLoginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'e2e.seller@test.com',
          password: 'password123',
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/sellers/profile')
        .set('Authorization', `Bearer ${sellerLoginResponse.body.accessToken}`)
        .send({
          companyName: 'E2E Healthcare Corp',
          industry: 'Healthcare',
          geography: 'Asia Pacific',
          annualRevenue: 2000000,
        })
        .expect(201);

      // 4. Seller gets matches
      const matchesResponse = await request(app.getHttpServer())
        .get('/sellers/matches')
        .set('Authorization', `Bearer ${sellerLoginResponse.body.accessToken}`)
        .expect(200);

      expect(matchesResponse.body.length).toBeGreaterThan(0);

      // 5. Seller sends introduction
      const introResponse = await request(app.getHttpServer())
        .post('/connections/introduction')
        .set('Authorization', `Bearer ${sellerLoginResponse.body.accessToken}`)
        .send({
          advisorIds: [matchesResponse.body[0].id],
        })
        .expect(200);

      expect(introResponse.body.emailsSent).toBeGreaterThan(0);
    });
  });
});
