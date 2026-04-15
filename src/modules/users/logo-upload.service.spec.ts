/**
 * Unit tests for UsersService.uploadLogo()
 * Tests: happy path, magic bytes rejection, dimension rejection, tenant isolation.
 * File system and sharp are mocked — no real files written.
 */
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as uploadConfig from '../../common/upload/logo-upload.config';
import type { DiskStoredUploadFile } from '../../common/upload/logo-upload.config';
import { UsersService } from './users.service';
import { mockLoggerValue } from '../../common/testing/mock-logger';

// ─── Mock fs ─────────────────────────────────────────────────────────────────
// jest.mock is hoisted — define jest.fn() inside the factory, access via module ref

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  existsSync: jest.fn(),
}));

// ─── Mock sharp ───────────────────────────────────────────────────────────────
// Expose a controllable metadata mock via a module-level container

const sharpMocks = { metadata: jest.fn().mockResolvedValue({ width: 400, height: 200 }) };

jest.mock('sharp', () => jest.fn().mockImplementation(() => ({ metadata: sharpMocks.metadata })));

// ─── Mock validateMagicBytes (default: valid) ─────────────────────────────────

jest.mock('../../common/upload/logo-upload.config', () => ({
  ...jest.requireActual('../../common/upload/logo-upload.config'),
  validateMagicBytes: jest.fn(),
  LOGOS_DIR: '/mock/uploads/logos',
  MAX_LOGO_WIDTH: 800,
  MAX_LOGO_HEIGHT: 400,
}));

// ─── Typed references to mock functions ───────────────────────────────────────

const mockReadFileSync = fs.readFileSync as jest.Mock;
const mockUnlinkSync = fs.unlinkSync as jest.Mock;
const mockExistsSync = fs.existsSync as jest.Mock;
const mockValidateMagicBytes = uploadConfig.validateMagicBytes as jest.Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-2';

const mockFile: DiskStoredUploadFile = {
  path: `/mock/uploads/logos/${USER_ID}.png`,
  filename: `${USER_ID}.png`,
  mimetype: 'image/png',
  size: 50_000,
};

const mockPrisma = {
  freelancerProfile: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
  },
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('UsersService.uploadLogo()', () => {
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFileSync.mockReturnValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG magic
    sharpMocks.metadata.mockResolvedValue({ width: 400, height: 200 });
    mockValidateMagicBytes.mockReturnValue(true);
    mockExistsSync.mockReturnValue(false);
    mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID }); // user exists
    mockPrisma.freelancerProfile.findUnique.mockResolvedValue(null);
    service = new UsersService(mockPrisma as any, mockLoggerValue as any);
  });

  it('happy path: persists logoStorageKey and returns it', async () => {
    const result = await service.uploadLogo(USER_ID, mockFile);

    expect(result).toEqual({ logoStorageKey: `logos/${mockFile.filename}` });
    expect(mockPrisma.freelancerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
        update: expect.objectContaining({ logoStorageKey: `logos/${mockFile.filename}` }),
      })
    );
  });

  it('rejects when magic bytes do not match declared MIME type', async () => {
    mockValidateMagicBytes.mockReturnValue(false);

    await expect(service.uploadLogo(USER_ID, mockFile)).rejects.toThrow(BadRequestException);
    // Must delete the uploaded file to avoid orphans
    expect(mockUnlinkSync).toHaveBeenCalledWith(mockFile.path);
    expect(mockPrisma.freelancerProfile.upsert).not.toHaveBeenCalled();
  });

  it('rejects when image dimensions exceed maximum', async () => {
    sharpMocks.metadata.mockResolvedValue({ width: 1200, height: 600 }); // exceeds 800×400

    await expect(service.uploadLogo(USER_ID, mockFile)).rejects.toThrow(BadRequestException);
    expect(mockUnlinkSync).toHaveBeenCalledWith(mockFile.path);
    expect(mockPrisma.freelancerProfile.upsert).not.toHaveBeenCalled();
  });

  it('deletes old logo when a previous one exists', async () => {
    const oldKey = `logos/${USER_ID}.jpeg`;
    mockPrisma.freelancerProfile.findUnique.mockResolvedValue({ logoStorageKey: oldKey });
    mockExistsSync.mockReturnValue(true);

    await service.uploadLogo(USER_ID, mockFile);

    // Old file must be deleted
    expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining(`${USER_ID}.jpeg`));
  });

  it('TENANT ISOLATION: filename is scoped to the authenticated userId', async () => {
    // Multer sets filename from req.user.id in the controller — here we verify
    // the service stores exactly the filename provided (no substitution).
    mockPrisma.user.findUnique.mockResolvedValue({ id: OTHER_USER_ID });
    const otherFile: DiskStoredUploadFile = {
      ...mockFile,
      filename: `${OTHER_USER_ID}.png`,
      path: `/mock/uploads/logos/${OTHER_USER_ID}.png`,
    };

    const result = await service.uploadLogo(OTHER_USER_ID, otherFile);

    expect(result.logoStorageKey).toBe(`logos/${OTHER_USER_ID}.png`);
    expect(mockPrisma.freelancerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: OTHER_USER_ID } })
    );
  });
});
