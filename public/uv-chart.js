// Simple UV Chart Renderer
document.addEventListener('DOMContentLoaded', function() {
  // Get chart canvas
  const canvas = document.getElementById('uvForecastGraph');
  if (!canvas) return;
  
  // Create and render the chart
  renderUVChart();
  
  // Re-render on window resize
  window.addEventListener('resize', function() {
    renderUVChart();
  });
  
  function renderUVChart() {
    const ctx = canvas.getContext('2d');
    
    // Set canvas dimensions to match its container for proper responsive behavior
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = Math.max(250, container.clientHeight);
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear the canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set up dimensions with margins
    const margin = { top: 10, right: 10, bottom: 30, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Define UV data points for a smooth curve
    const dataPoints = 200; // More points for smoother curve
    const uvData = [];
    
    // Generate a curve that rises and falls, peaking in the middle with smooth transitions
    for (let i = 0; i < dataPoints; i++) {
      const x = i / (dataPoints - 1);
      let y;
      
      if (x < 0.2) {
        // Start with a gentle curve from 0 to 2
        y = 2 * Math.pow(x / 0.2, 1.5);
      } else if (x < 0.4) {
        // Smooth rise from 2 to 12
        const t = (x - 0.2) / 0.2;
        y = 2 + 10 * Math.pow(t, 1.0);
      } else if (x < 0.6) {
        // Plateau at 12
        y = 12;
      } else if (x < 0.8) {
        // Smooth fall from 12 to 2
        const t = (x - 0.6) / 0.2;
        y = 12 - 10 * Math.pow(t, 1.0);
      } else {
        // Gentle curve from 2 to 0
        const t = (x - 0.8) / 0.2;
        y = 2 * (1 - Math.pow(t, 1.5));
      }
      
      uvData.push({ x: x, y: y });
    }
    
    // Calculate threshold crossing points
    const safeThreshold = 4;
    let morningCrossingX = null;
    let eveningCrossingX = null;
    
    // Find threshold crossings
    for (let i = 1; i < uvData.length; i++) {
      const prev = uvData[i-1];
      const curr = uvData[i];
      
      // Rising above threshold (morning)
      if (prev.y < safeThreshold && curr.y >= safeThreshold) {
        const t = (safeThreshold - prev.y) / (curr.y - prev.y);
        morningCrossingX = prev.x + t * (curr.x - prev.x);
      }
      
      // Falling below threshold (evening)
      if (prev.y >= safeThreshold && curr.y < safeThreshold) {
        const t = (prev.y - safeThreshold) / (prev.y - curr.y);
        eveningCrossingX = prev.x + t * (curr.x - prev.x);
      }
    }
    
    // Create fake timestamps for the crossing points
    const morningTime = morningCrossingX ? formatTime(8 + morningCrossingX * 9) : "08:50";
    const eveningTime = eveningCrossingX ? formatTime(8 + eveningCrossingX * 9) : "15:50";
    
    // Function to format decimal hours to HH:MM
    function formatTime(decimalHours) {
      const hours = Math.floor(decimalHours);
      const minutes = Math.floor((decimalHours - hours) * 60);
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    // Find y-position for threshold
    const yScale = chartHeight / 14; // Max UV is 14
    const thresholdY = height - margin.bottom - (safeThreshold * yScale);
    
    // Draw red area (unsafe)
    ctx.fillStyle = 'rgb(255, 200, 200)';
    ctx.fillRect(margin.left, margin.top, chartWidth, thresholdY - margin.top);
    
    // Draw green area (safe)
    ctx.fillStyle = 'rgb(200, 255, 200)';
    ctx.fillRect(margin.left, thresholdY, chartWidth, height - margin.bottom - thresholdY);
    
    // Draw "SAFE UV LEVELS" text in the green area
    ctx.fillStyle = 'rgba(46, 204, 113, 0.8)';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SAFE UV LEVELS', margin.left + chartWidth / 2, height - margin.bottom - 10);
    
    // Draw the threshold line
    ctx.beginPath();
    ctx.setLineDash([5, 5]);
    ctx.moveTo(margin.left, thresholdY);
    ctx.lineTo(margin.left + chartWidth, thresholdY);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw the UV curve using curve interpolation for smoothness
    ctx.beginPath();
    
    // Start at the first point
    const startX = margin.left + (uvData[0].x * chartWidth);
    const startY = height - margin.bottom - (uvData[0].y * yScale);
    ctx.moveTo(startX, startY);
    
    // Use bezier curves to draw a smooth line
    for (let i = 0; i < uvData.length - 1; i += 1) {
      const x0 = margin.left + (uvData[i].x * chartWidth);
      const y0 = height - margin.bottom - (uvData[i].y * yScale);
      const x1 = margin.left + (uvData[i+1].x * chartWidth);
      const y1 = height - margin.bottom - (uvData[i+1].y * yScale);
      
      // Calculate better control points for smoother curves
      const tension = 0.4; // Higher values make smoother curves
      const xDist = (x1 - x0) * tension;
      
      // Find the previous and next points to create smooth tangents
      const prevY = i > 0 ? height - margin.bottom - (uvData[i-1].y * yScale) : y0;
      const nextY = i < uvData.length - 2 ? height - margin.bottom - (uvData[i+2].y * yScale) : y1;
      
      // Calculate control points that create a smooth curve
      const cp1x = x0 + xDist/3;
      const cp1y = y0 + (y1 - prevY) * tension/3;
      const cp2x = x1 - xDist/3;
      const cp2y = y1 - (nextY - y0) * tension/3;
      
      // Use bezier curve for optimal smoothness
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x1, y1);
    }
    
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Draw X-axis (without labels)
    ctx.beginPath();
    ctx.moveTo(margin.left, height - margin.bottom);
    ctx.lineTo(margin.left + chartWidth, height - margin.bottom);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Draw timestamp markers at threshold crossing points
    if (morningCrossingX !== null) {
      const x = margin.left + (morningCrossingX * chartWidth);
      
      // Draw morning time label
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.font = '12px Arial';
      ctx.fillText(morningTime, x, height - margin.bottom + 20);
      
      // Draw small tick mark
      ctx.beginPath();
      ctx.moveTo(x, height - margin.bottom);
      ctx.lineTo(x, height - margin.bottom + 5);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    
    if (eveningCrossingX !== null) {
      const x = margin.left + (eveningCrossingX * chartWidth);
      
      // Draw evening time label
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.font = '12px Arial';
      ctx.fillText(eveningTime, x, height - margin.bottom + 20);
      
      // Draw small tick mark
      ctx.beginPath();
      ctx.moveTo(x, height - margin.bottom);
      ctx.lineTo(x, height - margin.bottom + 5);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    
    // Draw x-axis title
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.font = '12px Arial';
    ctx.fillText('Daylight Hours (Local Time)', margin.left + chartWidth / 2, height - 5);
    
    // Draw Y-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, height - margin.bottom);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Draw Y-axis title
    ctx.save();
    ctx.translate(10, margin.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('UV Index', 0, 0);
    ctx.restore();
    
    // Draw some y-axis tick marks
    const yTicks = [0, 4, 8, 12];
    yTicks.forEach(tick => {
      const y = height - margin.bottom - (tick * yScale);
      
      // Tick line
      ctx.beginPath();
      ctx.moveTo(margin.left - 5, y);
      ctx.lineTo(margin.left, y);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Tick label
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'right';
      ctx.fillText(tick.toString(), margin.left - 8, y + 4);
    });
  }
}); 