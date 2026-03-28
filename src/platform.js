/**
 * Platform abstraction layer for system metrics
 * Handles macOS, Linux, and Windows differences
 */
const { execSync } = require('child_process');
const os = require('os');
const CONFIG = require('./config');

/**
 * Get GPU stats based on current platform
 * @returns {Object|null} GPU stats object or null if unavailable
 */
function getGpuStats() {
    const platform = os.platform();
    
    try {
        switch (platform) {
            case 'darwin':
                return getMacOSGpuStats();
            case 'linux':
                return getLinuxGpuStats();
            case 'win32':
                return getWindowsGpuStats();
            default:
                return null;
        }
    } catch (e) {
        if (CONFIG.DEBUG) console.error(`GPU stats error on ${platform}:`, e.message);
        return null;
    }
}

/**
 * Get macOS GPU stats via ioreg (Apple Silicon)
 */
function getMacOSGpuStats() {
    try {
        const output = execSync('ioreg -c AGXAccelerator -r -d 1').toString();
        const statsMatch = output.match(/"PerformanceStatistics"\s*=\s*\{([^}]+)\}/);
        if (!statsMatch) return null;

        const statsString = statsMatch[1];
        const stats = {};
        statsString.split(',').forEach(line => {
            const parts = line.split('=');
            if (parts.length === 2) {
                const key = parts[0].trim().replace(/"/g, '');
                const value = parseInt(parts[1].trim());
                if (key && !isNaN(value)) stats[key] = value;
            }
        });

        const inUseGB = (stats["In use system memory"] / 1024 / 1024 / 1024).toFixed(2);
        const totalAllocatedGB = (stats["Alloc system memory"] / 1024 / 1024 / 1024).toFixed(2);
        return {
            utilization: stats["Device Utilization %"] || 0,
            gpuMemoryInUse: inUseGB,
            gpuMemoryTotal: totalAllocatedGB,
            platform: 'macos'
        };
    } catch (e) {
        if (CONFIG.DEBUG) console.error('macOS GPU stats error:', e.message);
        return null;
    }
}

/**
 * Get Linux GPU stats (NVIDIA via nvidia-smi, fallback to others)
 */
function getLinuxGpuStats() {
    // Try NVIDIA first
    try {
        const output = execSync('nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits').toString().trim();
        const [utilization, memoryUsed, memoryTotal] = output.split(',').map(v => parseFloat(v.trim()));
        return {
            utilization: utilization || 0,
            gpuMemoryInUse: (memoryUsed / 1024).toFixed(2),
            gpuMemoryTotal: (memoryTotal / 1024).toFixed(2),
            platform: 'linux-nvidia'
        };
    } catch (e) {
        // NVIDIA not available, try other methods
    }
    
    // Try ROCm for AMD GPUs
    try {
        const output = execSync('rocm-smi --showuse --showmeminfo vram').toString();
        const utilizationMatch = output.match(/(\d+)%/);
        const memMatch = output.match(/(\d+)\s*MiB.*?(\d+)\s*MiB/);
        if (utilizationMatch && memMatch) {
            return {
                utilization: parseInt(utilizationMatch[1]),
                gpuMemoryInUse: (parseInt(memMatch[1]) / 1024).toFixed(2),
                gpuMemoryTotal: (parseInt(memMatch[2]) / 1024).toFixed(2),
                platform: 'linux-amd'
            };
        }
    } catch (e) {
        // ROCm not available
    }
    
    if (CONFIG.DEBUG) console.log('No GPU monitoring available on Linux');
    return null;
}

/**
 * Get Windows GPU stats via wmic
 */
function getWindowsGpuStats() {
    try {
        // Get GPU utilization
        const utilOutput = execSync('wmic path win32_VideoController get loadpercentage /value').toString();
        const utilMatch = utilOutput.match(/LoadPercentage=(\d+)/);
        const utilization = utilMatch ? parseInt(utilMatch[1]) : 0;
        
        // Get adapter RAM (this is total VRAM)
        const memOutput = execSync('wmic path win32_VideoController get adapterram /value').toString();
        const memMatch = memOutput.match(/AdapterRAM=(\d+)/);
        const totalMemoryGB = memMatch ? (parseInt(memMatch[1]) / 1024 / 1024 / 1024).toFixed(2) : null;
        
        // Note: Used VRAM requires more complex WMI queries or external tools
        return {
            utilization: utilization,
            gpuMemoryInUse: null, // Not easily available without external tools
            gpuMemoryTotal: totalMemoryGB,
            platform: 'windows'
        };
    } catch (e) {
        if (CONFIG.DEBUG) console.error('Windows GPU stats error:', e.message);
        return null;
    }
}

module.exports = {
    getGpuStats,
    getMacOSGpuStats,
    getLinuxGpuStats,
    getWindowsGpuStats
};
