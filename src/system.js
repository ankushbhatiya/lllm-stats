const { execSync } = require('child_process');

function getGpuStats() {
    try {
        // Query ioreg for Apple Silicon GPU performance statistics
        const output = execSync('ioreg -c AGXAccelerator -r -d 1').toString();
        
        // Find the PerformanceStatistics section
        const statsMatch = output.match(/"PerformanceStatistics"\s*=\s*\{([^}]+)\}/);
        if (!statsMatch) return null;

        const statsString = statsMatch[1];
        const stats = {};

        // Parse keys like "In use system memory"=12345
        statsString.split(',').forEach(line => {
            const parts = line.split('=');
            if (parts.length === 2) {
                const key = parts[0].trim().replace(/"/g, '');
                const value = parseInt(parts[1].trim());
                if (key && !isNaN(value)) {
                    stats[key] = value;
                }
            }
        });

        const inUseGB = (stats["In use system memory"] / 1024 / 1024 / 1024).toFixed(2);
        const utilization = stats["Device Utilization %"] || 0;

        return {
            utilization: utilization,
            gpuMemoryInUse: inUseGB,
            raw: stats
        };
    } catch (error) {
        return null;
    }
}

function getLmsStatus() {
    try {
        const output = execSync('lms status').toString();
        const isServerRunning = output.includes('Server: ON');
        return {
            serverOn: isServerRunning,
            raw: output
        };
    } catch (e) {
        return { serverOn: false };
    }
}

module.exports = {
    getGpuStats,
    getLmsStatus
};
