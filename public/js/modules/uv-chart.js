import { CubicSpline } from './spline.js';
import { generateSmoothCurve as generateSmoothCurveLinear } from './uv-utils.js'; // Linear fallback

let uvChart = null; // Keep track of the chart instance locally within this module

// Helper function to get color by segment
function getSegmentColor(ctx, type, uvColors) {
  const value = ctx.p0.parsed.y;
  if (value <= 3) return type === 'line' ? uvColors.low.lineColor : uvColors.low.fillColor;
  if (value <= 6) return type === 'line' ? uvColors.moderate.lineColor : uvColors.moderate.fillColor;
  if (value <= 8) return type === 'line' ? uvColors.high.lineColor : uvColors.high.fillColor;
  if (value <= 11) return type === 'line' ? uvColors.veryHigh.lineColor : uvColors.veryHigh.fillColor;
  return type === 'line' ? uvColors.extreme.lineColor : uvColors.extreme.fillColor;
}

// Function to generate a smooth curve using cubic spline
function generateSmoothCurveWithSpline(uvReadings) {
  if (!uvReadings || uvReadings.length < 2) {
    console.error('Cannot generate smooth curve: insufficient data');
    // Fall back to original data as points
    return {
      times: uvReadings.map(reading => {
        const date = new Date(reading.utc);
        return date.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Dubai' // Display in local time
        });
      }),
      values: uvReadings.map(reading => reading.uv)
    };
  }

  try {
    // Prepare data for interpolation
    const x = uvReadings.map(r => new Date(r.utc).getTime()); // ms since epoch
    const y = uvReadings.map(r => r.uv);

    console.log('Prepared data for spline:', {
      timeRange: [new Date(x[0]).toISOString(), new Date(x[x.length-1]).toISOString()],
      uvRange: [Math.min(...y), Math.max(...y)],
      points: x.length
    });

    // Create spline using our direct implementation
    console.log('Creating CubicSpline instance');
    const spline = new CubicSpline(x, y);
    console.log('CubicSpline instance created successfully');

    // Generate smoothed points (every 10 minutes)
    const start = x[0];
    const end = x[x.length - 1];
    const step = 10 * 60 * 1000; // 10 minutes in ms

    const smoothTimes = [];
    const smoothValues = [];

    for (let t = start; t <= end; t += step) {
      // Interpolate UV value at this time
      const uv = spline.at(t);

      // Format time for display
      const timeStr = new Date(t).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Dubai' // Display in local time
      });

      smoothTimes.push(timeStr);
      smoothValues.push(uv);
    }

    console.log(`Generated ${smoothTimes.length} smooth points using cubic spline`);
    console.log('Sample points:', smoothValues.slice(0, 3), '...', smoothValues.slice(-3));
    return { times: smoothTimes, values: smoothValues };
  } catch (error) {
    console.error('Error generating smooth curve with spline:', error);
    console.log('Falling back to linear interpolation after error');

    // Fall back to linear interpolation if spline fails
    // Prepare data correctly for the linear fallback function
    const fallbackData = uvReadings.map(reading => {
      const date = new Date(reading.utc);
      return {
        time: date.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Dubai'
        }),
        uv: reading.uv
      };
    });
    // Extract times and values into separate arrays
    const fallbackTimes = fallbackData.map(d => d.time);
    const fallbackValues = fallbackData.map(d => d.uv);

    // Call the linear function with correct arguments
    return generateSmoothCurveLinear(fallbackTimes, fallbackValues);
  }
}


// Update UV chart
function updateUvChart(canvas, uvReadings, currentUv, currentTime, uvRiseTime, uvFallTime) {
  if (!canvas) return null;

  // Clean up previous chart if it exists
  if (uvChart) {
    uvChart.destroy();
    uvChart = null;
  }

  // Generate smooth curve using cubic spline interpolation
  const smoothData = generateSmoothCurveWithSpline(uvReadings);

  // Create annotations for rise and fall times
  const annotations = {};

  if (uvRiseTime) {
    annotations.riseTime = {
      type: 'line',
      xMin: uvRiseTime,
      xMax: uvRiseTime,
      borderColor: 'rgba(255, 152, 0, 0.8)',
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        content: `UV > 4 at ${uvRiseTime}`,
        enabled: true,
        position: 'top',
        backgroundColor: 'rgba(255, 152, 0, 0.8)',
        color: 'white',
        padding: 4,
        font: {
          size: 12
        }
      }
    };
  }

  if (uvFallTime) {
    annotations.fallTime = {
      type: 'line',
      xMin: uvFallTime,
      xMax: uvFallTime,
      borderColor: 'rgba(76, 175, 80, 0.8)',
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        content: `UV < 4 at ${uvFallTime}`,
        enabled: true,
        position: 'top',
        backgroundColor: 'rgba(76, 175, 80, 0.8)',
        color: 'white',
        padding: 4,
        font: {
          size: 12
        }
      }
    };
  }

  // Add horizontal threshold line at UV=4
  annotations.threshold = {
    type: 'line',
    yMin: 4,
    yMax: 4,
    borderColor: 'rgba(255, 152, 0, 0.8)',
    borderWidth: 2,
    borderDash: [5, 5],
    label: {
      content: 'Protection Level',
      enabled: true,
      position: 'end',
      backgroundColor: 'rgba(255, 152, 0, 0.8)',
      color: 'white',
      padding: 4,
      font: {
        size: 12
      }
    }
  };

  // Add vertical line for current time
  const currentTimeStr = currentTime.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Dubai'
  });

  annotations.currentTime = {
    type: 'line',
    xMin: currentTimeStr,
    xMax: currentTimeStr,
    borderColor: '#000000',
    borderWidth: 3,
    drawTime: 'afterDatasetsDraw' // Ensure it's drawn on top
  };

  // Create chart context
  const ctx = canvas.getContext('2d');

  // Define colors for different UV ranges
  const uvColors = {
    low: { lineColor: 'rgba(76, 175, 80, 1)', fillColor: 'rgba(76, 175, 80, 0.8)' },       // Green
    moderate: { lineColor: 'rgba(255, 235, 59, 1)', fillColor: 'rgba(255, 235, 59, 0.8)' }, // Yellow
    high: { lineColor: 'rgba(255, 152, 0, 1)', fillColor: 'rgba(255, 152, 0, 0.8)' },      // Orange
    veryHigh: { lineColor: 'rgba(233, 30, 99, 1)', fillColor: 'rgba(233, 30, 99, 0.8)' },   // Pink/red
    extreme: { lineColor: 'rgba(156, 39, 176, 1)', fillColor: 'rgba(156, 39, 176, 0.8)' } // Purple
  };

  // Create the datasets
  const datasets = [{
    label: '', // Empty label to hide in legend
    data: smoothData.values,
    // Segment styling is now used instead of mapping colors directly here
    segment: {
      borderColor: ctx => getSegmentColor(ctx, 'line', uvColors),
      backgroundColor: ctx => getSegmentColor(ctx, 'fill', uvColors),
    },
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.4,
    fill: true
  }];

  // Add current time point marker
  if (currentUv !== null && smoothData.times.length > 0) {
    // Find closest time index
    let closestIndex = -1;
    let minDiff = Infinity;
    const curMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    for (let i = 0; i < smoothData.times.length; i++) {
      const timeStr = smoothData.times[i];
      if (!timeStr) continue;
      const parts = timeStr.split(':');
      if (parts.length !== 2) continue;
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      if (isNaN(hours) || isNaN(minutes)) continue;

      const timeMinutes = hours * 60 + minutes;
      const diff = Math.abs(timeMinutes - curMinutes);

      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }

    // Create point data if a valid index is found
    if (closestIndex >= 0 && smoothData.values[closestIndex] !== undefined && smoothData.values[closestIndex] !== null) {
      const pointData = Array(smoothData.values.length).fill(null);
      pointData[closestIndex] = smoothData.values[closestIndex];

      datasets.push({
        data: pointData,
        backgroundColor: '#000', // Black square
        borderColor: '#fff',     // White border
        borderWidth: 2,
        pointRadius: 8,
        pointStyle: 'rectRot',   // Rotated square
        pointHoverRadius: 10,
        fill: false,
        showLine: false,
        label: 'Current Time' // Optional: Label for this specific point dataset
      });
    } else {
        console.warn("Could not place current time marker. Closest index or value invalid.", { closestIndex, currentUv, smoothDataValues: smoothData.values });
    }
  }

  // Create the chart instance
  uvChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: smoothData.times,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 10, right: 10, bottom: 5, left: 5 }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12, // Limit ticks for clarity
            color: '#333',
            font: { size: 10 }
          }
        },
        y: {
          beginAtZero: true,
          // Dynamically set max based on data, add some padding
          suggestedMax: smoothData.values.length > 0 ? Math.max(6, Math.ceil(Math.max(...smoothData.values) * 1.1)) : 6,
          ticks: {
            stepSize: 2,
            color: '#333',
            font: { size: 10 },
            // Hide zero label
            callback: function(value) {
              return value === 0 ? '' : value;
            }
          },
          grid: {
            color: 'rgba(200, 200, 200, 0.3)' // Lighter grid lines
          }
        }
      },
      plugins: {
        legend: {
          display: false // Hide dataset labels in the legend
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          titleColor: 'white',
          bodyColor: 'white',
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
          padding: 8,
          displayColors: false, // Don't show color box in tooltip
          callbacks: {
            // Show time in title
            title: function(tooltipItems) {
              return tooltipItems[0].label;
            },
            // Show UV index in body
            label: function(context) {
                // Check if it's the marker point dataset
               if (context.dataset.label === 'Current Time') {
                   return `Current UV: ${context.parsed.y.toFixed(1)}`;
               }
               // Otherwise, show interpolated UV
               return `UV Index: ${context.raw.toFixed(1)}`;
            }
          }
        },
        annotation: { // Ensure chartjs-plugin-annotation is loaded
          annotations: annotations
        }
      },
      interaction: {
        intersect: false, // Tooltip triggers on hover anywhere along the x-axis
        mode: 'index'     // Show tooltips for all datasets at that index
      }
    }
  });

  return uvChart; // Return the created chart instance
}

export { updateUvChart }; // Export the main function 