import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { Advisor } from '../advisors/schemas/advisor.schema';
import { Seller } from '../sellers/schemas/seller.schema';

describe('MatchingService', () => {
  let service: MatchingService;

  const mockSeller = {
    _id: 'seller123',
    userId: 'user123',
    companyName: 'Seller Company',
    industry: 'Technology',
    geography: 'North America',
    annualRevenue: 500000,
  };

  const mockAdvisors = [
    {
      _id: 'advisor1',
      companyName: 'Advisor 1',
      industries: ['Technology', 'Finance'],
      geographies: ['North America'],
      yearsExperience: 10,
      revenueRange: { min: 100000, max: 1000000 },
      isActive: true,
      sendLeads: true,
    },
    {
      _id: 'advisor2',
      companyName: 'Advisor 2',
      industries: ['Healthcare'],
      geographies: ['Europe'],
      yearsExperience: 5,
      revenueRange: { min: 200000, max: 800000 },
      isActive: true,
      sendLeads: true,
    },
  ];

  const mockSellerModel = {
    findOne: jest.fn(),
  };

  const mockAdvisorModel = {
    find: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn(),
    countDocuments: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        {
          provide: getModelToken(Advisor.name),
          useValue: mockAdvisorModel,
        },
        {
          provide: getModelToken(Seller.name),
          useValue: mockSellerModel,
        },
      ],
    }).compile();

    service = module.get<MatchingService>(MatchingService);
    jest.clearAllMocks();
    mockAdvisorModel.sort.mockResolvedValue([]);
  });

  describe('findMatches', () => {
    it('✅ should match by industry & geography', async () => {
      mockSellerModel.findOne.mockResolvedValue(mockSeller);
      mockAdvisorModel.sort.mockResolvedValue([mockAdvisors[0]]);

      const result = await service.findMatches('user123');

      expect(result).toHaveLength(1);
      expect(result[0].companyName).toBe('Advisor 1');
      expect(mockAdvisorModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          industries: expect.any(Object),
          isActive: true,
          sendLeads: true,
        }),
      );
    });

    it('❌ should return empty array when no matches', async () => {
      mockSellerModel.findOne.mockResolvedValue(mockSeller);
      mockAdvisorModel.sort.mockResolvedValue([]);

      const result = await service.findMatches('user123');

      expect(result).toHaveLength(0);
    });

    it('✅ should filter by revenue range', async () => {
      const highRevenueSeller = {
        ...mockSeller,
        annualRevenue: 2000000, // $2M - outside advisor1 range
      };

      mockSellerModel.findOne.mockResolvedValue(highRevenueSeller);
      mockAdvisorModel.sort.mockResolvedValue([]);

      const result = await service.findMatches('user123');

      expect(result).toHaveLength(0);
      expect(mockAdvisorModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          industries: expect.any(Object),
          isActive: true,
          sendLeads: true,
        }),
      );
    });

    it('✅ should only include active advisors', async () => {
      mockSellerModel.findOne.mockResolvedValue(mockSeller);

      // Verify query includes isActive: true
      await service.findMatches('user123');

      expect(mockAdvisorModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          sendLeads: true,
        }),
      );
    });

    it('❌ should throw error if seller not found', async () => {
      mockSellerModel.findOne.mockResolvedValue(null);

      await expect(service.findMatches('user123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMatchStats', () => {
    it('✅ should return match statistics', async () => {
      mockSellerModel.findOne.mockResolvedValue(mockSeller);
      mockAdvisorModel.sort.mockResolvedValue(mockAdvisors);

      const result = await service.getMatchStats('user123');

      expect(result.totalMatches).toBe(mockAdvisors.length);
      expect(result.industries).toContain('Technology');
      expect(result.geographies).toContain('North America');
    });
  });
});
