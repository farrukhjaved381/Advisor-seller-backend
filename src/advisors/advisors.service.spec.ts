import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdvisorsService } from './advisors.service';
import { Advisor } from './schemas/advisor.schema';

describe('AdvisorsService', () => {
  let service: AdvisorsService;

  const mockAdvisor = {
    _id: 'advisor123',
    userId: 'user123',
    companyName: 'Test Company',
    industries: ['Technology'],
    geographies: ['North America'],
    yearsExperience: 10,
    isActive: false,
    sendLeads: true,
  };

  const mockAdvisorModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    save: jest.fn(),
    constructor: jest.fn().mockImplementation(() => ({
      save: jest.fn().mockResolvedValue(mockAdvisor),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvisorsService,
        {
          provide: getModelToken(Advisor.name),
          useValue: mockAdvisorModel,
        },
      ],
    }).compile();

    service = module.get<AdvisorsService>(AdvisorsService);
  });

  describe('createProfile', () => {
    it('✅ should create advisor profile', async () => {
      const createDto = {
        companyName: 'Test Company',
        industries: ['Technology'],
        geographies: ['North America'],
        yearsExperience: 10,
      };

      mockAdvisorModel.findOne.mockResolvedValue(null);
      mockAdvisorModel.constructor().save.mockResolvedValue(mockAdvisor);

      const result = await service.createProfile('user123', createDto);

      expect(result.companyName).toBe(createDto.companyName);
      expect(mockAdvisorModel.findOne).toHaveBeenCalledWith({
        userId: 'user123',
      });
    });

    it('❌ should throw error for duplicate profile', async () => {
      const createDto = {
        companyName: 'Test Company',
        industries: ['Technology'],
        geographies: ['North America'],
        yearsExperience: 10,
      };

      mockAdvisorModel.findOne.mockResolvedValue(mockAdvisor);

      await expect(service.createProfile('user123', createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updateProfile', () => {
    it('✅ should update advisor profile', async () => {
      const updateDto = { companyName: 'Updated Company' };
      const updatedAdvisor = { ...mockAdvisor, ...updateDto };

      mockAdvisorModel.findOneAndUpdate.mockResolvedValue(updatedAdvisor);

      const result = await service.updateProfile('user123', updateDto);

      expect(result.companyName).toBe('Updated Company');
    });

    it('❌ should throw error if profile not found', async () => {
      mockAdvisorModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(service.updateProfile('user123', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('activateProfile', () => {
    it('✅ should activate advisor profile', async () => {
      const activatedAdvisor = { ...mockAdvisor, isActive: true };
      mockAdvisorModel.findOneAndUpdate.mockResolvedValue(activatedAdvisor);

      const result = await service.activateProfile('user123');

      expect(result.isActive).toBe(true);
    });
  });
});
