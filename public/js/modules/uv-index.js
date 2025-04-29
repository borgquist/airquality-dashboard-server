// UV Index module for handling UV data and charts

// Fetch the UV index data from the server
async function fetchUvIndexData(forceRefresh = false, isSseEvent = false) {
  try {
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    const url = `/api/uvindex?_=${timestamp}${forceRefresh ? '&force=1' : ''}${isSseEvent ? '&_sse=1' : ''}`;
    console.log(`Fetching UV index data with${forceRefresh ? ' forced refresh' : ' normal request'}${isSseEvent ? ' (SSE initiated)' : ''}: ${url}`);
    
    const response = await fetch(url, {
      cache: forceRefresh ? 'no-store' : 'default',
      headers: {
        'Cache-Control': forceRefresh ? 'no-cache' : 'default',
        'Pragma': forceRefresh ? 'no-cache' : 'default'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("UV Data received:", data);
    
    // Store the data for future reference
    lastUvData = data;
    
    // Update the display - this creates the UV box if it doesn't exist
    updateUvIndexDisplay(data);
    
    debugPrint(`UV data updated: ${JSON.stringify(data)}`);
  } catch (error) {
    console.error('Error fetching UV index data:', error);
  }
}

// Update the UV index display
function updateUvIndexDisplay(data) {
  if (!data || data.error || !data.result || !data.result.length) {
    console.warn('Invalid UV data format or error:', data?.error || 'No result array');
    
    // Still update the display with empty values
    document.getElementById('uvCurrentValue').textContent = '-';
    document.getElementById('uvCurrentClass').textContent = '-';
    document.getElementById('uvRiseTime').textContent = 'Rise above 3: --:--';
    document.getElementById('uvFallTime').textContent = 'Fall below 3: --:--';
    return;
  }
  
  // Process UV data
  const uvReadings = data.result.map(item => ({
    utc: new Date(item.uv_time).toISOString().substring(11, 16), // Extract HH:MM
    uv: item.uv
  }));
  
  // Find crossings for UV index of 3 (moderate threshold)
  const uvRiseTime = findCrossing(uvReadings, 3, "rising");
  const uvFallTime = findCrossing(uvReadings, 3, "falling");
  
  // Get current UV level
  const currentTime = new Date();
  const currentUv = getCurrentUvLevel(uvReadings, currentTime);
  
  // Update UV value display
  const uvCurrentValue = document.getElementById('uvCurrentValue');
  if (uvCurrentValue) {
    uvCurrentValue.textContent = currentUv !== null ? currentUv.toFixed(1) : '-';
  }
  
  // Update UV class display
  const uvCurrentClass = document.getElementById('uvCurrentClass');
  if (uvCurrentClass) {
    uvCurrentClass.textContent = getUvCategoryName(currentUv);
    
    // Remove all category classes
    uvCurrentClass.classList.remove('uv-low', 'uv-moderate', 'uv-high', 'uv-very-high', 'uv-extreme');
    
    // Add appropriate class
    const uvClass = getUvClass(currentUv);
    if (uvClass) {
      uvCurrentClass.classList.add(uvClass);
    }
    
    // Also add class to parent .uv-box
    const uvBox = document.querySelector('.uv-box');
    if (uvBox) {
      uvBox.classList.remove('uv-low', 'uv-moderate', 'uv-high', 'uv-very-high', 'uv-extreme');
      if (uvClass) {
        uvBox.classList.add(uvClass);
      }
    }
  }
  
  // Update crossing times
  const uvRiseElement = document.getElementById('uvRiseTime');
  const uvFallElement = document.getElementById('uvFallTime');
  
  if (uvRiseElement) {
    uvRiseElement.textContent = uvRiseTime ? `Rise above 3: ${uvRiseTime}` : 'Rise above 3: --:--';
  }
  
  if (uvFallElement) {
    uvFallElement.textContent = uvFallTime ? `Fall below 3: ${uvFallTime}` : 'Fall below 3: --:--';
  }
  
  // Update UV info with recommendations
  const uvInfo = document.getElementById('uvInfo');
  if (uvInfo) {
    uvInfo.innerHTML = getUvInfoAndRecommendations(currentUv);
  }
  
  // Update chart
  updateUvChart(uvReadings, uvRiseTime, uvFallTime);
}

// Update UV chart
function updateUvChart(uvReadings, uvRiseTime, uvFallTime) {
  const canvas = document.getElementById('uvChart');
  if (!canvas) return;
  
  // Clean up previous chart if it exists
  if (uvChart) {
    uvChart.destroy();
  }
  
  // Prepare data for chart
  const times = uvReadings.map(reading => reading.utc);
  const values = uvReadings.map(reading => reading.uv);
  
  // Generate additional points for a smoother curve
  const smoothData = generateSmoothCurve(times, values);
  
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
        padding: 4
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
        padding: 4
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
      padding: 4
    }
  };
  
  // Create chart
  const ctx = canvas.getContext('2d');
  uvChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: smoothData.times,
      datasets: [
        {
          label: 'UV Index',
          data: smoothData.values,
          borderColor: 'rgba(233, 30, 99, 0.8)',
          backgroundColor: 'rgba(233, 30, 99, 0.2)',
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
            color: '#333'
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(...values) * 1.1,
          ticks: {
            stepSize: 2,
            color: '#333'
          },
          grid: {
            color: 'rgba(200, 200, 200, 0.3)'
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          titleColor: 'white',
          bodyColor: 'white',
          callbacks: {
            title: function(tooltipItems) {
              return tooltipItems[0].label;
            },
            label: function(context) {
              return `UV Index: ${context.raw.toFixed(1)}`;
            }
          }
        },
        annotation: {
          annotations: annotations
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    }
  });
}

// Get UV category name
function getUvCategoryName(uvValue) {
  if (uvValue === null) return '-';
  if (uvValue < 3) return 'Low';
  if (uvValue < 6) return 'Moderate';
  if (uvValue < 8) return 'High';
  if (uvValue < 11) return 'Very High';
  return 'Extreme';
}

// Get UV recommendations
function getUvInfoAndRecommendations(uvValue) {
  if (uvValue === null) return '';
  
  let recommendations = '';
  
  if (uvValue < 3) {
    recommendations = 'Low risk. No protection needed for most people.';
  } else if (uvValue < 6) {
    recommendations = 'Moderate risk. Wear sunscreen SPF 30+, hat, and sunglasses.';
  } else if (uvValue < 8) {
    recommendations = 'High risk. Stay in shade during midday hours. Use SPF 30+ sunscreen, hat, and sunglasses.';
  } else if (uvValue < 11) {
    recommendations = 'Very high risk. Minimize sun exposure between 10am and 4pm. Apply SPF 30+ every 2 hours.';
  } else {
    recommendations = 'Extreme risk. Avoid outdoors during midday hours. Shirt, sunscreen, hat, and sunglasses are essential.';
  }
  
  return `<p>${recommendations}</p>`;
}

// Generate additional points for a smoother curve
function generateSmoothCurve(times, values) {
  if (times.length !== values.length || times.length < 2) {
    return { times, values };
  }
  
  const smoothTimes = [];
  const smoothValues = [];
  
  // Convert times to minutes for interpolation
  const minutesTimes = times.map(time => timeToMinutes(time));
  
  // Add extra points between each original point
  for (let i = 0; i < times.length - 1; i++) {
    const startTime = minutesTimes[i];
    const endTime = minutesTimes[i + 1];
    const startValue = values[i];
    const endValue = values[i + 1];
    
    // How many points to add between (more points for wider time gaps)
    const pointsToAdd = Math.max(5, Math.ceil((endTime - startTime) / 5));
    
    for (let j = 0; j <= pointsToAdd; j++) {
      const fraction = j / pointsToAdd;
      const currentMinutes = startTime + fraction * (endTime - startTime);
      const currentValue = startValue + fraction * (endValue - startValue);
      
      smoothTimes.push(minutesToTime(currentMinutes));
      smoothValues.push(currentValue);
    }
  }
  
  // Add last point if needed
  if (smoothTimes[smoothTimes.length - 1] !== times[times.length - 1]) {
    smoothTimes.push(times[times.length - 1]);
    smoothValues.push(values[values.length - 1]);
  }
  
  return { times: smoothTimes, values: smoothValues };
}

// Find the interpolated crossing time
function findCrossing(uvReadings, targetUV, direction = "rising") {
  for (let i = 0; i < uvReadings.length - 1; i++) {
    const current = uvReadings[i];
    const next = uvReadings[i + 1];

    if ((direction === "rising" && current.uv < targetUV && next.uv >= targetUV) ||
        (direction === "falling" && current.uv > targetUV && next.uv <= targetUV)) {

      const uvDelta = next.uv - current.uv;
      const timeDelta = timeToMinutes(next.utc) - timeToMinutes(current.utc);
      const fraction = (targetUV - current.uv) / uvDelta;
      const interpolatedMinutes = timeToMinutes(current.utc) + (fraction * timeDelta);

      return minutesToTime(interpolatedMinutes); // Already in local time
    }
  }
  return null; // No crossing found
}

// Get current UV level based on time interpolation
function getCurrentUvLevel(uvReadings, currentTime) {
  if (!uvReadings || uvReadings.length === 0) return null;
  
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  
  // Find surrounding data points
  for (let i = 0; i < uvReadings.length - 1; i++) {
    const current = uvReadings[i];
    const next = uvReadings[i + 1];
    
    const currentMinutesUtc = timeToMinutes(current.utc);
    const nextMinutesUtc = timeToMinutes(next.utc);
    
    if (currentMinutes >= currentMinutesUtc && currentMinutes <= nextMinutesUtc) {
      // Interpolate
      const fraction = (currentMinutes - currentMinutesUtc) / (nextMinutesUtc - currentMinutesUtc);
      return current.uv + fraction * (next.uv - current.uv);
    }
  }
  
  // Outside the range, get closest value
  const firstTime = timeToMinutes(uvReadings[0].utc);
  const lastTime = timeToMinutes(uvReadings[uvReadings.length - 1].utc);
  
  if (currentMinutes < firstTime) return uvReadings[0].uv;
  if (currentMinutes > lastTime) return uvReadings[uvReadings.length - 1].uv;
  
  return null;
}

// Get UV index class for styling
function getUvClass(uvValue) {
  if (uvValue === null) return '';
  if (uvValue < 3) return 'uv-low';
  if (uvValue < 6) return 'uv-moderate';
  if (uvValue < 8) return 'uv-high';
  if (uvValue < 11) return 'uv-very-high';
  return 'uv-extreme';
}

// Convert "HH:MM" string to minutes since midnight
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

// Convert minutes since midnight to "HH:MM" string
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
} 