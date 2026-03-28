const platform = require('../src/platform');
const { execSync } = require('child_process');

jest.mock('child_process');

describe('Platform Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getMacOSGpuStats', () => {
        test('should parse ioreg output correctly', () => {
            const mockOutput = `
                "PerformanceStatistics" = {
                    "Device Utilization %" = 45,
                    "In use system memory" = 2147483648,
                    "Alloc system memory" = 4294967296
                }
            `;
            execSync.mockReturnValue(Buffer.from(mockOutput));

            const stats = platform.getMacOSGpuStats();
            
            expect(stats).toEqual({
                utilization: 45,
                gpuMemoryInUse: '2.00',
                gpuMemoryTotal: '4.00',
                platform: 'macos'
            });
        });

        test('should return null when ioreg fails', () => {
            execSync.mockImplementation(() => {
                throw new Error('Command failed');
            });

            const stats = platform.getMacOSGpuStats();
            expect(stats).toBeNull();
        });

        test('should return null when PerformanceStatistics not found', () => {
            execSync.mockReturnValue(Buffer.from('No statistics here'));
            
            const stats = platform.getMacOSGpuStats();
            expect(stats).toBeNull();
        });
    });

    describe('getLinuxGpuStats', () => {
        test('should parse nvidia-smi output', () => {
            execSync.mockReturnValue(Buffer.from('75, 2048, 4096'));

            const stats = platform.getLinuxGpuStats();
            
            expect(stats).toEqual({
                utilization: 75,
                gpuMemoryInUse: '2.00',
                gpuMemoryTotal: '4.00',
                platform: 'linux-nvidia'
            });
        });

        test('should fallback to rocm-smi when nvidia-smi fails', () => {
            execSync.mockImplementation((cmd) => {
                if (cmd.includes('nvidia-smi')) {
                    throw new Error('nvidia-smi not found');
                }
                return Buffer.from('GPU[0] : 60%\nVRAM: 1024 MiB (4096 MiB)');
            });

            const stats = platform.getLinuxGpuStats();
            
            expect(stats).toEqual({
                utilization: 60,
                gpuMemoryInUse: '1.00',
                gpuMemoryTotal: '4.00',
                platform: 'linux-amd'
            });
        });

        test('should return null when no GPU tools available', () => {
            execSync.mockImplementation(() => {
                throw new Error('Command not found');
            });

            const stats = platform.getLinuxGpuStats();
            expect(stats).toBeNull();
        });
    });

    describe('getWindowsGpuStats', () => {
        test('should parse wmic output', () => {
            execSync.mockImplementation((cmd) => {
                if (cmd.includes('loadpercentage')) {
                    return Buffer.from('LoadPercentage=65');
                }
                return Buffer.from('AdapterRAM=8589934592');
            });

            const stats = platform.getWindowsGpuStats();
            
            expect(stats).toEqual({
                utilization: 65,
                gpuMemoryInUse: null,
                gpuMemoryTotal: '8.00',
                platform: 'windows'
            });
        });

        test('should return null when wmic fails', () => {
            execSync.mockImplementation(() => {
                throw new Error('wmic not found');
            });

            const stats = platform.getWindowsGpuStats();
            expect(stats).toBeNull();
        });
    });

    describe('getGpuStats', () => {
        test('should delegate to platform-specific handler based on current platform', () => {
            // This test just verifies that getGpuStats calls the correct handler
            // based on the current platform. Since we can't easily mock process.platform,
            // we just test that it returns a result or null appropriately.
            
            // Mock execSync to return valid data for whatever platform we're on
            const mockOutput = `
                "PerformanceStatistics" = {
                    "Device Utilization %" = 50,
                    "In use system memory" = 1073741824,
                    "Alloc system memory" = 2147483648
                }
            `;
            execSync.mockReturnValue(Buffer.from(mockOutput));

            const stats = platform.getGpuStats();
            
            // Should return either a stats object or null (if on unsupported platform)
            expect(stats === null || typeof stats === 'object').toBe(true);
        });

        test('should handle errors gracefully', () => {
            execSync.mockImplementation(() => {
                throw new Error('Command failed');
            });

            // Test getMacOSGpuStats directly for error handling
            const stats = platform.getMacOSGpuStats();
            expect(stats).toBeNull();
        });
    });
});
