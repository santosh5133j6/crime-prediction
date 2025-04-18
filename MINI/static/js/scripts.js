document.addEventListener('DOMContentLoaded', function() {
    // Initialize map if element exists
    const mapElement = document.getElementById('map');
    if (mapElement) {
        initializeMap();
    }

    // Initialize dashboard visualizations if they exist
    const kdeMapElement = document.getElementById('kde-map');
    if (kdeMapElement) {
        initializeDashboardVisualizations();
    }

    // Add date validation
    const dateInput = document.querySelector('input[name="date_range"]');
    if (dateInput) {
        // Set min date to today
        const today = new Date();
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() + 1); // Allow dates up to 1 year in the future
        
        // Format dates as YYYY-MM-DD
        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // Set min and max dates
        dateInput.min = formatDate(today);
        dateInput.max = formatDate(maxDate);

        // Set default value to today
        dateInput.value = formatDate(today);

        // Add validation on change
        dateInput.addEventListener('change', function(e) {
            const selectedDate = new Date(this.value);
            const currentDate = new Date();
            
            // Reset time part for accurate date comparison
            selectedDate.setHours(0, 0, 0, 0);
            currentDate.setHours(0, 0, 0, 0);

            if (selectedDate < currentDate) {
                alert('Please select today or a future date');
                this.value = formatDate(currentDate);
            }
        });
    }

    // Smooth scrolling for navigation links
    document.querySelectorAll('.nav-links a').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href.includes('#')) {
                e.preventDefault();
                const targetId = '#' + href.split('#')[1];
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({
                        behavior: 'smooth'
                    });
                } else {
                    window.location.href = href;
                }
            }
        });
    });

    // Initialize location picker map
    const locationPickerMap = document.getElementById('location-picker-map');
    if (locationPickerMap) {
        initializeLocationPicker();
    }
});

function initializeMap() {
    const map = L.map('map').setView([28.7041, 77.1025], 5); // Default to India
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const cities = [
        { name: "Visakhapatnam", coords: [17.6868, 83.2185] },
        { name: "Vijayawada", coords: [16.5062, 80.6480] },
        { name: "Tirupati", coords: [13.6288, 79.4192] }
    ];

    cities.forEach(function(city) {
        L.marker(city.coords)
            .bindPopup(`<b>${city.name}</b>`)
            .addTo(map);
    });
}

function initializeDashboardVisualizations() {
    const serverDataElement = document.getElementById('server-data');
    let serverResults = null;
    if (serverDataElement) {
        try {
            serverResults = JSON.parse(serverDataElement.textContent || 'null');
        } catch (e) {
            console.error('Error parsing server data:', e);
        }
    }

    const crimeTypesElement = document.getElementById('crime-types');
    let crimeTypes = ['THEFT', 'ASSAULT', 'ROBBERY', 'OTHER']; // Default
    if (crimeTypesElement) {
        try {
            crimeTypes = JSON.parse(crimeTypesElement.textContent) || crimeTypes;
        } catch (e) {
            console.error('Error parsing crime types:', e);
        }
    }

    // Initialize or update KDE map
    let kdeMap = window.kdeMap; // Check if map exists in global scope
    const kdeMapElement = document.getElementById('kde-map');
    if (!kdeMap && kdeMapElement) {
        kdeMap = L.map('kde-map').setView([28.7041, 77.1025], 8);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(kdeMap);
        window.kdeMap = kdeMap; // Store map in global scope to reuse
    } else if (kdeMap) {
        kdeMap.eachLayer(layer => {
            if (layer instanceof L.TileLayer) return; // Keep tile layer
            kdeMap.removeLayer(layer); // Remove markers or other overlays
        });
        kdeMap.invalidateSize(); // Refresh map size
    }

    if (serverResults && serverResults.kde && serverResults.input_features) {
        const lat = parseFloat(serverResults.input_features.Latitude);
        const lng = parseFloat(serverResults.input_features.Longitude);
        kdeMap.setView([lat, lng], 12);

        L.circleMarker([lat, lng], {
            radius: Math.max(5, serverResults.kde.intensity * 15),
            fillColor: '#ff7846',
            color: '#ff6347',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(kdeMap)
        .bindPopup(`Hotspot Intensity: ${(serverResults.kde.intensity * 100).toFixed(1)}%`)
        .openPopup();
    }

    // Initialize SVM Chart
    const svmChartElement = document.getElementById('svm-chart');
    if (svmChartElement && serverResults && serverResults.svm) {
        const ctx = svmChartElement.getContext('2d');
        const highRisk = serverResults.svm.high_risk * 100;
        const lowRisk = (1 - serverResults.svm.high_risk) * 100;

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Low Risk', 'High Risk'],
                datasets: [{
                    data: [lowRisk, highRisk],
                    backgroundColor: ['#4CAF50', '#F44336']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // Initialize Poisson Chart
    const poissonChartElement = document.getElementById('poisson-chart');
    if (poissonChartElement && serverResults && serverResults.poisson) {
        const ctx = poissonChartElement.getContext('2d');
        const baseValue = serverResults.poisson.prediction || 1;

        // Define monthly crime rate factors based on historical patterns
        const monthlyFactors = {
            // Winter months - typically lower crime rates
            0: 0.85,  // January
            1: 0.90,  // February
            11: 0.95, // December
            
            // Spring months - moderate increase
            2: 1.15,  // March
            3: 1.20,  // April
            4: 1.25,  // May
            
            // Summer months - highest crime rates
            5: 1.35,  // June
            6: 1.40,  // July
            7: 1.35,  // August
            
            // Fall months - gradual decrease
            8: 1.20,  // September
            9: 1.10,  // October
            10: 1.00  // November
        };

        // Calculate crime rate predictions with seasonal adjustments
        const forecastData = Array(12).fill(baseValue).map((val, index) => {
            // Apply seasonal factor
            let prediction = val * monthlyFactors[index];
            
            // Add location-based adjustment if available
            if (serverResults.kde && serverResults.kde.intensity) {
                prediction *= (1 + serverResults.kde.intensity);
            }
            
            // Add risk-based adjustment if available
            if (serverResults.svm && serverResults.svm.high_risk) {
                prediction *= (1 + serverResults.svm.high_risk * 0.5);
            }
            
            // Add small random variation (±5%)
            const randomFactor = 1 + (Math.random() * 0.1 - 0.05);
            prediction *= randomFactor;
            
            // Ensure prediction is not negative and round to 2 decimals
            return Math.max(0, Number(prediction.toFixed(2)));
        });

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Predicted Crime Rate',
                    data: forecastData,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Predicted Number of Crimes'
                        },
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(1);
                            }
                        },
                        suggestedMin: 0,
                        suggestedMax: Math.ceil(Math.max(...forecastData) * 1.1)
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Month'
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Predicted Crimes: ${context.raw.toFixed(1)}`;
                            },
                            afterLabel: function(context) {
                                const month = context.label;
                                const factor = monthlyFactors[context.dataIndex];
                                return `Seasonal Factor: ${(factor * 100).toFixed(0)}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Initialize K-means Chart
    const kmeansChartElement = document.getElementById('kmeans-chart');
    if (kmeansChartElement && serverResults && serverResults.kmeans) {
        const ctx = kmeansChartElement.getContext('2d');
        let clusterDist = serverResults.kmeans.crime_distribution;
        console.log('K-Means cluster:', serverResults.kmeans.cluster);
        console.log('K-Means distribution:', clusterDist);

        if (!Array.isArray(clusterDist) || clusterDist.length === 0) {
            console.warn('Invalid K-Means distribution, using default');
            clusterDist = Array(crimeTypes.length).fill(1.0 / crimeTypes.length);
        }

        // Filter out very small values for better visualization
        const significantCrimes = crimeTypes.filter((type, index) => clusterDist[index] > 0.02);
        const significantDist = clusterDist.filter(val => val > 0.02);

        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: significantCrimes,
                datasets: [{
                    data: significantDist,
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.7)',   // Red
                        'rgba(54, 162, 235, 0.7)',   // Blue
                        'rgba(255, 206, 86, 0.7)',   // Yellow
                        'rgba(75, 192, 192, 0.7)',   // Teal
                        'rgba(153, 102, 255, 0.7)',  // Purple
                        'rgba(255, 159, 64, 0.7)',   // Orange
                        'rgba(201, 203, 207, 0.7)',  // Grey
                        'rgba(255, 99, 71, 0.7)',    // Tomato
                        'rgba(144, 238, 144, 0.7)'   // Light green
                    ].slice(0, significantCrimes.length),
                    borderColor: [
                        'rgba(255, 99, 132, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)',
                        'rgba(255, 159, 64, 1)',
                        'rgba(201, 203, 207, 1)',
                        'rgba(255, 99, 71, 1)',
                        'rgba(144, 238, 144, 1)'
                    ].slice(0, significantCrimes.length),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        display: true,
                        labels: {
                            boxWidth: 12,
                            padding: 10,
                            font: {
                                size: 11
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(tooltipItem) {
                                return `${tooltipItem.label}: ${(tooltipItem.raw * 100).toFixed(1)}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Export handlers
    window.exportPDF = function() {
        const serverData = JSON.parse(document.getElementById('server-data').textContent || 'null');
        if (!serverData) {
            alert('No data available to export');
            return;
        }

        // Create new jsPDF instance
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Set initial position
        let y = 20;
        
        // Add title
        doc.setFontSize(16);
        doc.text('Crime Prediction Report', 20, y);
        y += 10;
        
        // Add generation date
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, y);
        y += 15;
        
        // Add prediction results
        doc.setFontSize(12);
        if (serverData.poisson) {
            doc.text(`Predicted Crimes: ${serverData.poisson.prediction}`, 20, y);
            y += 10;
        }
        if (serverData.kde) {
            doc.text(`Hotspot Intensity: ${(serverData.kde.intensity * 100).toFixed(1)}%`, 20, y);
            y += 10;
        }
        if (serverData.svm) {
            doc.text(`Risk Probability: ${(serverData.svm.high_risk * 100).toFixed(1)}%`, 20, y);
            y += 10;
        }
        
        // Add K-means data if available
        if (serverData.kmeans) {
            doc.text(`Cluster: ${serverData.kmeans.cluster}`, 20, y);
            y += 10;
            doc.text('Crime Distribution:', 20, y);
            y += 5;
            
            const crimeTypes = JSON.parse(document.getElementById('crime-types').textContent);
            serverData.kmeans.crime_distribution.forEach((dist, index) => {
                if (y > 270) { // Check if we need a new page
                    doc.addPage();
                    y = 20;
                }
                doc.text(`  ${crimeTypes[index]}: ${(dist * 100).toFixed(1)}%`, 20, y);
                y += 7;
            });
        }
        
        // Save the PDF
        doc.save(`crime_prediction_report_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    window.exportCSV = function() {
        const serverData = JSON.parse(document.getElementById('server-data').textContent || 'null');
        if (!serverData) {
            alert('No data available to export');
            return;
        }

        // Create CSV content
        let csvContent = 'Category,Value\n';
        
        if (serverData.poisson) {
            csvContent += `Predicted Crimes,${serverData.poisson.prediction}\n`;
        }
        if (serverData.kde) {
            csvContent += `Hotspot Intensity,${(serverData.kde.intensity * 100).toFixed(1)}%\n`;
        }
        if (serverData.svm) {
            csvContent += `Risk Probability,${(serverData.svm.high_risk * 100).toFixed(1)}%\n`;
        }
        if (serverData.kmeans) {
            csvContent += `Cluster,${serverData.kmeans.cluster}\n`;
            const crimeTypes = JSON.parse(document.getElementById('crime-types').textContent);
            serverData.kmeans.crime_distribution.forEach((dist, index) => {
                csvContent += `${crimeTypes[index]},${(dist * 100).toFixed(1)}%\n`;
            });
        }

        // Create a Blob containing the CSV content
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        
        // Create a temporary link and trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = `crime_prediction_data_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };
}

function initializeLocationPicker() {
    // Initialize the map centered on Andhra Pradesh
    const map = L.map('location-picker-map').setView([15.9129, 79.7400], 7);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Define districts with their coordinates, boundaries, and dataset locations
    const districts = {
        "Anantapur": { 
            lat: 14.6819, 
            lng: 77.6006,
            searchTerms: ["anantapur", "anantapuram", "anantpur"],
            bounds: [[14.2819, 77.2006], [15.0819, 78.0006]],
            locations: [
                { lat: 15.1763, lng: 77.69, desc: "Transport Hub", intensity: "high", crimeTypes: ["THEFT", "MOTOR VEHICLE THEFT"] },
                { lat: 15.1735, lng: 77.6938, desc: "Residential Area", intensity: "high", crimeTypes: ["BURGLARY", "WEAPONS VIOLATION"] },
                { lat: 15.1749, lng: 77.7029, desc: "Commercial Zone", intensity: "high", crimeTypes: ["THEFT", "DECEPTIVE PRACTICE"] },
                { lat: 15.1425, lng: 77.7269, desc: "School Zone", intensity: "high", crimeTypes: ["OFFENSE INVOLVING CHILDREN", "BATTERY"] }
            ]
        },
        "Chittoor": { 
            lat: 13.2172, 
            lng: 79.1003,
            searchTerms: ["chittoor", "chittur", "chittorgarh"],
            bounds: [[12.8172, 78.7003], [13.6172, 79.5003]],
            locations: [
                { lat: 13.2172, lng: 79.1003, desc: "Market Complex", intensity: "high", crimeTypes: ["THEFT", "DECEPTIVE PRACTICE"] },
                { lat: 13.2350, lng: 79.0950, desc: "Educational District", intensity: "high", crimeTypes: ["OFFENSE INVOLVING CHILDREN", "BATTERY"] },
                { lat: 13.2100, lng: 79.1100, desc: "Residential Complex", intensity: "high", crimeTypes: ["BURGLARY", "WEAPONS VIOLATION"] },
                { lat: 13.2200, lng: 79.0900, desc: "Transit Center", intensity: "high", crimeTypes: ["MOTOR VEHICLE THEFT", "NARCOTICS"] }
            ]
        },
        "East Godavari": { 
            lat: 17.2855, 
            lng: 82.0345,
            searchTerms: ["east godavari", "kakinada", "rajahmundry"],
            bounds: [[16.8855, 81.6345], [17.6855, 82.4345]],
            locations: [
                { lat: 16.9891, lng: 82.2475, desc: "Port Area", intensity: "high", crimeTypes: ["THEFT", "NARCOTICS"] },
                { lat: 17.0157, lng: 82.2777, desc: "Urban Center", intensity: "high", crimeTypes: ["WEAPONS VIOLATION", "BATTERY"] },
                { lat: 16.9500, lng: 82.2389, desc: "School District", intensity: "high", crimeTypes: ["OFFENSE INVOLVING CHILDREN", "DECEPTIVE PRACTICE"] },
                { lat: 17.0000, lng: 82.2500, desc: "Residential Zone", intensity: "high", crimeTypes: ["BURGLARY", "CRIM SEXUAL ASSAULT"] }
            ]
        },
        "Guntur": { 
            lat: 16.3067, 
            lng: 80.4365,
            searchTerms: ["guntur", "gunturu"],
            bounds: [[15.9067, 80.0365], [16.7067, 80.8365]],
            locations: [
                { lat: 16.3067, lng: 80.4365, desc: "City Center", intensity: "high", crimeTypes: ["THEFT", "WEAPONS VIOLATION"] },
                { lat: 16.3100, lng: 80.4400, desc: "Educational Hub", intensity: "high", crimeTypes: ["OFFENSE INVOLVING CHILDREN", "BATTERY"] },
                { lat: 16.3200, lng: 80.4300, desc: "Transport Hub", intensity: "high", crimeTypes: ["MOTOR VEHICLE THEFT", "NARCOTICS"] },
                { lat: 16.3150, lng: 80.4450, desc: "Residential Area", intensity: "high", crimeTypes: ["BURGLARY", "CRIM SEXUAL ASSAULT"] }
            ]
        },
        "Krishna": { 
            lat: 16.1697, 
            lng: 81.1339,
            searchTerms: ["krishna", "vijayawada", "machilipatnam"],
            bounds: [[15.7697, 80.7339], [16.5697, 81.5339]],
            locations: [
                { lat: 16.5062, lng: 80.6480, desc: "Commercial Center", intensity: "high", crimeTypes: ["THEFT", "DECEPTIVE PRACTICE"] },
                { lat: 16.4974, lng: 80.6368, desc: "School Zone", intensity: "high", crimeTypes: ["OFFENSE INVOLVING CHILDREN", "BATTERY"] },
                { lat: 16.5141, lng: 80.6343, desc: "Transport Hub", intensity: "high", crimeTypes: ["MOTOR VEHICLE THEFT", "NARCOTICS"] },
                { lat: 16.5200, lng: 80.6400, desc: "Residential District", intensity: "high", crimeTypes: ["BURGLARY", "WEAPONS VIOLATION"] }
            ]
        },
        "Nellore": { 
            lat: 14.4426, 
            lng: 79.9865,
            searchTerms: ["nellore", "nellur", "sri potti sriramulu nellore"],
            bounds: [[14.0426, 79.5865], [14.8426, 80.3865]],
            locations: [
                { lat: 14.4426, lng: 79.9865, desc: "Urban Center", intensity: "high", crimeTypes: ["THEFT", "WEAPONS VIOLATION"] },
                { lat: 14.4500, lng: 79.9900, desc: "Educational Zone", intensity: "high", crimeTypes: ["OFFENSE INVOLVING CHILDREN", "BATTERY"] },
                { lat: 14.4450, lng: 79.9850, desc: "Transport Hub", intensity: "high", crimeTypes: ["MOTOR VEHICLE THEFT", "DECEPTIVE PRACTICE"] },
                { lat: 14.4480, lng: 79.9880, desc: "Residential Area", intensity: "high", crimeTypes: ["BURGLARY", "CRIM SEXUAL ASSAULT"] }
            ]
        },
        "Prakasam": { 
            lat: 15.3485, 
            lng: 79.5603,
            searchTerms: ["prakasam", "ongole"],
            bounds: [[14.9485, 79.1603], [15.7485, 79.9603]],
            locations: [
                { lat: 15.3485, lng: 79.5603, desc: "City Center", intensity: "high", crimeTypes: ["THEFT", "NARCOTICS"] },
                { lat: 15.3500, lng: 79.5650, desc: "School District", intensity: "high", crimeTypes: ["OFFENSE INVOLVING CHILDREN", "BATTERY"] },
                { lat: 15.3550, lng: 79.5600, desc: "Transport Area", intensity: "high", crimeTypes: ["MOTOR VEHICLE THEFT", "DECEPTIVE PRACTICE"] },
                { lat: 15.3520, lng: 79.5630, desc: "Residential Zone", intensity: "high", crimeTypes: ["BURGLARY", "WEAPONS VIOLATION"] }
            ]
        },
        "Srikakulam": { 
            lat: 18.2949, 
            lng: 83.8938,
            searchTerms: ["srikakulam", "srikakulum", "srikalahasti"],
            bounds: [[17.8949, 83.4938], [18.6949, 84.2938]],
            locations: [
                { lat: 18.2949, lng: 83.8938, desc: "Commercial Hub", intensity: "high", crimeTypes: ["THEFT", "DECEPTIVE PRACTICE"] },
                { lat: 18.3000, lng: 83.9000, desc: "Educational Area", intensity: "high", crimeTypes: ["OFFENSE INVOLVING CHILDREN", "BATTERY"] },
                { lat: 18.2900, lng: 83.8900, desc: "Transport Center", intensity: "high", crimeTypes: ["MOTOR VEHICLE THEFT", "NARCOTICS"] },
                { lat: 18.2980, lng: 83.8970, desc: "Residential District", intensity: "high", crimeTypes: ["BURGLARY", "CRIM SEXUAL ASSAULT"] }
            ]
        },
        "Vishakhapatnam": { 
            lat: 17.6868, 
            lng: 83.2185,
            searchTerms: ["vishakhapatnam", "vizag", "visakhapatnam", "waltair"],
            bounds: [[17.2868, 82.8185], [18.0868, 83.6185]],
            locations: [
                { lat: 17.7281, lng: 83.3045, desc: "Beach Road", intensity: "high", crimeTypes: ["THEFT", "WEAPONS VIOLATION"] },
                { lat: 17.7079, lng: 83.2978, desc: "School Zone", intensity: "high", crimeTypes: ["OFFENSE INVOLVING CHILDREN", "BATTERY"] },
                { lat: 17.7187, lng: 83.3080, desc: "Transport Hub", intensity: "high", crimeTypes: ["MOTOR VEHICLE THEFT", "DECEPTIVE PRACTICE"] },
                { lat: 17.7150, lng: 83.3000, desc: "Port Area", intensity: "high", crimeTypes: ["NARCOTICS", "CRIM SEXUAL ASSAULT"] }
            ]
        },
        "Vizianagaram": { 
            lat: 18.1067, 
            lng: 83.3975,
            searchTerms: ["vizianagaram", "vijayanagaram"],
            bounds: [[17.7067, 82.9975], [18.5067, 83.7975]],
            locations: [
                { lat: 18.1067, lng: 83.3975, desc: "City Center", intensity: "high", crimeTypes: ["THEFT", "WEAPONS VIOLATION"] },
                { lat: 18.1100, lng: 83.4000, desc: "Educational Zone", intensity: "high", crimeTypes: ["OFFENSE INVOLVING CHILDREN", "BATTERY"] },
                { lat: 18.1050, lng: 83.3950, desc: "Transport Area", intensity: "high", crimeTypes: ["MOTOR VEHICLE THEFT", "DECEPTIVE PRACTICE"] },
                { lat: 18.1080, lng: 83.3990, desc: "Residential Complex", intensity: "high", crimeTypes: ["BURGLARY", "CRIM SEXUAL ASSAULT"] }
            ]
        },
        "West Godavari": { 
            lat: 16.9174, 
            lng: 81.3399,
            searchTerms: ["west godavari", "eluru", "bhimavaram"],
            bounds: [[16.5174, 80.9399], [17.3174, 81.7399]],
            locations: [
                { lat: 16.9174, lng: 81.3399, desc: "Urban Center", intensity: "high", crimeTypes: ["THEFT", "NARCOTICS"] },
                { lat: 16.9200, lng: 81.3450, desc: "School District", intensity: "high", crimeTypes: ["OFFENSE INVOLVING CHILDREN", "BATTERY"] },
                { lat: 16.9150, lng: 81.3380, desc: "Transport Hub", intensity: "high", crimeTypes: ["MOTOR VEHICLE THEFT", "DECEPTIVE PRACTICE"] },
                { lat: 16.9190, lng: 81.3420, desc: "Residential Area", intensity: "high", crimeTypes: ["BURGLARY", "WEAPONS VIOLATION"] }
            ]
        }
    };

    // Get input elements
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');
    const manualLatInput = document.getElementById('manual_latitude');
    const manualLngInput = document.getElementById('manual_longitude');
    const districtSelect = document.querySelector('select[name="district"]');
    const searchInput = document.getElementById('location-search');
    const searchResults = document.getElementById('search-results');
    const locationSuggestions = document.getElementById('location-suggestions');
    const locationInputToggle = document.getElementById('location-input-toggle');
    const inputModeLabel = document.getElementById('input-mode-label');
    const mapSelectionMode = document.getElementById('map-selection-mode');
    const manualInputMode = document.getElementById('manual-input-mode');
    
    // Current marker and polygon references
    let currentMarker = null;
    let currentDistrictPolygon = null;
    let districtMarkers = new Map();
    let locationMarkers = [];

    // Function to toggle between map and manual input modes
    function toggleInputMode() {
        const isManualMode = locationInputToggle.checked;
        mapSelectionMode.style.display = isManualMode ? 'none' : 'block';
        manualInputMode.style.display = isManualMode ? 'block' : 'none';
        inputModeLabel.textContent = isManualMode ? 'Manual Input Mode' : 'Map Selection Mode';

        // Clear the other mode's inputs when switching
        if (isManualMode) {
            // When switching to manual mode, clear map selection
            if (currentMarker) {
                map.removeLayer(currentMarker);
            }
            if (currentDistrictPolygon) {
                map.removeLayer(currentDistrictPolygon);
            }
            locationMarkers.forEach(marker => map.removeLayer(marker));
            locationMarkers = [];
            districtSelect.value = '';
            searchInput.value = '';
        } else {
            // When switching to map mode, clear manual inputs
            manualLatInput.value = '';
            manualLngInput.value = '';
        }
    }

    // Add event listener for the toggle switch
    locationInputToggle.addEventListener('change', toggleInputMode);

    // Function to update coordinates (works for both modes)
    function updateCoordinates(lat, lng) {
        lat = parseFloat(lat);
        lng = parseFloat(lng);
        
        if (isNaN(lat) || isNaN(lng)) return;
        
        // Update hidden inputs for form submission
        latInput.value = lat.toFixed(4);
        lngInput.value = lng.toFixed(4);
        
        // Update visible inputs based on mode
        if (locationInputToggle.checked) {
            // Manual mode
            manualLatInput.value = lat.toFixed(4);
            manualLngInput.value = lng.toFixed(4);
        } else {
            // Map mode
            if (currentMarker) {
                map.removeLayer(currentMarker);
            }
            currentMarker = L.marker([lat, lng]).addTo(map);
            map.setView([lat, lng], 10);
        }
    }

    // Add event listeners for manual coordinate inputs
    manualLatInput.addEventListener('change', function() {
        if (manualLngInput.value) {
            updateCoordinates(this.value, manualLngInput.value);
        }
    });

    manualLngInput.addEventListener('change', function() {
        if (manualLatInput.value) {
            updateCoordinates(manualLatInput.value, this.value);
        }
    });

    // Modify the existing updateLocation function to use the new updateCoordinates
    function updateLocation(lat, lng, zoomLevel = 10) {
        updateCoordinates(lat, lng);
        if (zoomLevel !== null && !locationInputToggle.checked) {
            map.setView([lat, lng], zoomLevel);
        }
    }

    // Function to show district boundary and location suggestions
    function showDistrictBoundary(districtName) {
        // Remove existing polygon and location markers
        if (currentDistrictPolygon) {
            map.removeLayer(currentDistrictPolygon);
        }
        locationMarkers.forEach(marker => map.removeLayer(marker));
        locationMarkers = [];

        const district = districts[districtName];
        if (district && district.bounds) {
            // Create a rectangle for the district boundary
            currentDistrictPolygon = L.rectangle(district.bounds, {
                color: '#3388ff',
                weight: 2,
                fillOpacity: 0.1
            }).addTo(map);

            // Add location markers from the dataset with intensity-based styling
            if (district.locations && district.locations.length > 0) {
                district.locations.forEach(loc => {
                    // Set marker color based on intensity
                    const markerColor = loc.intensity === 'high' ? 'red' : 
                                      loc.intensity === 'medium' ? 'orange' : 'blue';
                    
                    const marker = L.circleMarker([loc.lat, loc.lng], {
                        radius: loc.intensity === 'high' ? 12 : 
                                loc.intensity === 'medium' ? 8 : 6,
                        fillColor: markerColor,
                        color: '#fff',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.8
                    }).addTo(map);
                    
                    marker.bindPopup(`
                        <div style="min-width: 200px;">
                            <h4 style="margin: 0 0 8px 0; color: ${markerColor};">
                                ${loc.desc}
                                ${loc.intensity === 'high' ? 
                                    '<span style="color: red;">⚠️ High Intensity Area</span>' : 
                                    loc.intensity === 'medium' ? 
                                    '<span style="color: orange;">⚠️ Medium Intensity Area</span>' : ''}
                            </h4>
                            <p style="margin: 5px 0;">
                                <strong>Common Crime Types:</strong><br>
                                ${loc.crimeTypes.join(', ')}
                            </p>
                            <p style="margin: 5px 0;">
                                <strong>Coordinates:</strong><br>
                                Lat: ${loc.lat}, Lng: ${loc.lng}
                            </p>
                            <button onclick="selectLocation(${loc.lat}, ${loc.lng})" 
                                    style="margin-top: 10px; padding: 8px 12px; cursor: pointer; background-color: ${markerColor}; color: white; border: none; border-radius: 4px; width: 100%;">
                                Select This Location
                            </button>
                        </div>
                    `, {
                        maxWidth: 300
                    });
                    
                    locationMarkers.push(marker);
                });
            }

            // Fit map to the district bounds
            map.fitBounds(district.bounds);
        }
    }

    // Function to handle search
    function handleSearch(searchTerm) {
        searchResults.innerHTML = '';
        if (!searchTerm) {
            searchResults.style.display = 'none';
            return;
        }

        searchTerm = searchTerm.toLowerCase();
        const matches = [];

        // Search through districts
        Object.entries(districts).forEach(([name, data]) => {
            if (name.toLowerCase().includes(searchTerm) || 
                data.searchTerms.some(term => term.includes(searchTerm))) {
                matches.push({
                    name: name,
                    type: 'district',
                    lat: data.lat,
                    lng: data.lng
                });
            }
        });

        // If we have matches, show them
        if (matches.length > 0) {
            matches.forEach(match => {
                const div = document.createElement('div');
                div.className = 'search-result';
                div.style.padding = '8px 12px';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid #eee';
                div.style.transition = 'background-color 0.2s';
                div.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${match.name}`;

                div.addEventListener('mouseover', () => {
                    div.style.backgroundColor = '#f0f0f0';
                });
                div.addEventListener('mouseout', () => {
                    div.style.backgroundColor = 'white';
                });

                div.addEventListener('click', () => {
                    updateLocation(match.lat, match.lng);
                    if (match.type === 'district') {
                        districtSelect.value = match.name;
                        updateDistrictMarkers(match.name);
                    }
                    searchInput.value = match.name;
                    searchResults.style.display = 'none';
                });

                searchResults.appendChild(div);
            });
            searchResults.style.display = 'block';
        } else {
            searchResults.style.display = 'none';
        }
    }

    // Add district markers with tooltips
    Object.entries(districts).forEach(([name, data]) => {
        const marker = L.marker([data.lat, data.lng], {
            title: name
        });
        
        marker.bindPopup(`
            <b>${name} District</b><br>
            Latitude: ${data.lat}<br>
            Longitude: ${data.lng}<br>
            <button onclick="selectDistrict('${name}')" 
                    style="margin-top: 5px; padding: 5px 10px; cursor: pointer;">
                Select District
            </button>
        `);

        districtMarkers.set(name, marker);
    });

    // Function to show only selected district's marker and boundary
    function updateDistrictMarkers(selectedDistrict) {
        districtMarkers.forEach((marker, district) => {
            if (district === selectedDistrict) {
                marker.addTo(map);
                marker.openPopup();
                showDistrictBoundary(district);
            } else {
                marker.remove();
            }
        });
    }

    // Add search input event listeners
    searchInput.addEventListener('input', (e) => {
        handleSearch(e.target.value);
    });

    searchInput.addEventListener('focus', (e) => {
        if (e.target.value) {
            handleSearch(e.target.value);
        }
    });

    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
    });

    // Update the location suggestions panel
    function updateLocationSuggestions(district) {
        if (!locationSuggestions || !district.locations || district.locations.length === 0) return;
        
        const suggestionsList = document.createElement('div');
        suggestionsList.className = 'location-suggestions';
        suggestionsList.innerHTML = '<h4 style="margin: 10px 0;">High-Risk Areas:</h4>';
        
        // Sort locations by intensity
        const sortedLocations = [...district.locations].sort((a, b) => {
            const intensityOrder = { high: 3, medium: 2, low: 1 };
            return intensityOrder[b.intensity] - intensityOrder[a.intensity];
        });

        sortedLocations.forEach(loc => {
            const intensityColor = loc.intensity === 'high' ? '#ff4444' : 
                                 loc.intensity === 'medium' ? '#ffa700' : '#4285f4';
            
            const item = document.createElement('div');
            item.className = 'location-suggestion-item';
            item.innerHTML = `
                <div style="padding: 12px; cursor: pointer; border-bottom: 1px solid #eee; transition: background-color 0.3s;">
                    <div style="display: flex; align-items: center; margin-bottom: 5px;">
                        <i class="fas fa-exclamation-triangle" style="color: ${intensityColor}; margin-right: 8px;"></i>
                        <strong>${loc.desc}</strong>
                    </div>
                    <div style="font-size: 0.9em; color: #666; margin-left: 24px;">
                        ${loc.crimeTypes.join(', ')}<br>
                        <small>Lat: ${loc.lat}, Lng: ${loc.lng}</small>
                    </div>
                </div>
            `;
            
            item.onmouseover = () => {
                item.style.backgroundColor = '#f8f9fa';
            };
            item.onmouseout = () => {
                item.style.backgroundColor = 'transparent';
            };
            item.onclick = () => {
                updateLocation(loc.lat, loc.lng, null);
            };
            
            suggestionsList.appendChild(item);
        });
        
        locationSuggestions.innerHTML = '';
        locationSuggestions.appendChild(suggestionsList);
    }

    // Update the district selection handler to use the new suggestions
    districtSelect.addEventListener('change', function() {
        const selectedDistrict = this.value;
        if (selectedDistrict && districts[selectedDistrict]) {
            const district = districts[selectedDistrict];
            updateLocation(district.lat, district.lng);
            updateDistrictMarkers(selectedDistrict);
            searchInput.value = selectedDistrict;
            updateLocationSuggestions(district);
        } else {
            if (currentDistrictPolygon) {
                map.removeLayer(currentDistrictPolygon);
            }
            locationMarkers.forEach(marker => map.removeLayer(marker));
            locationMarkers = [];
            if (locationSuggestions) {
                locationSuggestions.innerHTML = '';
            }
        }
    });

    // Handle map clicks
    map.on('click', function(e) {
        if (locationInputToggle.checked) return; // Disable map clicks in manual mode
        
        const selectedDistrict = districtSelect.value;
        
        if (selectedDistrict && districts[selectedDistrict]) {
            const district = districts[selectedDistrict];
            const bounds = district.bounds;
            
            if (e.latlng.lat >= bounds[0][0] && e.latlng.lat <= bounds[1][0] &&
                e.latlng.lng >= bounds[0][1] && e.latlng.lng <= bounds[1][1]) {
                updateCoordinates(e.latlng.lat, e.latlng.lng);
            } else {
                alert('Please select a location within the selected district.');
            }
        } else {
            updateCoordinates(e.latlng.lat, e.latlng.lng);
            districtSelect.value = "";
            searchInput.value = "";
            districtMarkers.forEach(marker => marker.remove());
            if (currentDistrictPolygon) {
                map.removeLayer(currentDistrictPolygon);
            }
        }
    });

    // Initialize the toggle state
    toggleInputMode();

    // Global function to select district from popup
    window.selectDistrict = function(districtName) {
        if (districts[districtName]) {
            const district = districts[districtName];
            updateLocation(district.lat, district.lng);
            districtSelect.value = districtName;
            searchInput.value = districtName;
            updateDistrictMarkers(districtName);
        }
    };

    // Global function to select location from popup
    window.selectLocation = function(lat, lng) {
        updateLocation(lat, lng, null);
    };

    // Show initial district if one is selected
    if (districtSelect.value && districts[districtSelect.value]) {
        const district = districts[districtSelect.value];
        updateLocation(district.lat, district.lng);
        updateDistrictMarkers(districtSelect.value);
        searchInput.value = districtSelect.value;
    }
}