
# SARTHI Health Monitor

## Introduction

**SARTHI Health Monitor** is an innovative Hardware designed to help users monitor their health in real-time. It integrates hardware and software to provide a seamless health-monitoring experience.

The hardware component consists of an ESP32 microcontroller equipped with sensors like:

-   **MAX30100** (Pulse Oximeter and Heart Rate Sensor)
    
-   **MLX90614** (Non-Contact Infrared Temperature Sensor)
    
-   **AD8232** (ECG Sensor)
    

The software component includes a web-based interface and a backend built with Flask. The backend processes sensor data using **NeuroKit2**, a powerful library for biosignal processing. The processed data is then displayed on the frontend in an intuitive and user-friendly manner.

----------

## Features

-   **Real-Time Data Visualization:** View health metrics like heart rate, oxygen levels, temperature, and ECG signals in real-time.
    
-   **Advanced Signal Processing:** Accurate processing of biosignals using NeuroKit2.
    
-   **User-Friendly Interface:** A clean and easy-to-navigate dashboard.
    
-   **Cross-Platform Support:** Compatible with both desktop and mobile devices.
    
-   **Secure Connectivity:** Use HTTPS for secure communication between frontend and backend.
    

----------

## Getting Started

To set up SARTHI Health Monitor, follow these steps:

### Backend Setup

1.  Clone the repository:
    
    git clone https://github.com/kuldeepaher01/sarthi-health-monitor.git
    
    cd sarthi-health-monitor/backend
    
2.  Install dependencies:
    
    pip install -r requirements.txt
    
3.  Start the Flask server:
    
    python app.py
    
4.  Use **Ngrok** to create an HTTPS tunnel for the backend:
    
    ngrok http 5000
    
    Copy the HTTPS URL provided by Ngrok.
    

### Frontend Setup

1.  Navigate to the frontend folder:
    
    cd ../frontend
    
2.  Install dependencies:
    
    npm install
    
3.  Run the Next.js application in HTTPS mode:
    
    next dev --experimental-https
    

----------

## Usage

1.  Connect the hardware (ESP32 with sensors) and ensure it is transmitting data.
    
2.  Open the web application on your browser using the HTTPS URL generated by Ngrok for the backend.
    
3. Connect to the ESP32 device using the web application... select the Health Monitor and be ready to monitor your health in real-time.

----------

## Web Application Screenshots

![Home Page](https://github.com/kuldeepaher01/Saarthi-Health-Monitoring/blob/main/docs/Group%2013.png)

## Hardware
![PCB](https://github.com/kuldeepaher01/Saarthi-Health-Monitoring/blob/main/docs/pcb.png)
![Hardware](https://github.com/kuldeepaher01/Saarthi-Health-Monitoring/blob/main/docs/exploded_front.jpg)

![IRL](https://github.com/kuldeepaher01/Saarthi-Health-Monitoring/blob/main/docs/irl_opened.jpg)

## CAD

![CAD](https://github.com/kuldeepaher01/Saarthi-Health-Monitoring/blob/main/docs/cad.png)

## Signal Processing

![Processed Signal Combined](https://github.com/kuldeepaher01/Saarthi-Health-Monitoring/blob/main/docs/output.png)

![Signal Summary](https://github.com/kuldeepaher01/Saarthi-Health-Monitoring/blob/main/docs/wet_electrode_signal_combined.png)


## Technologies Used

### Hardware:

-   ESP32 Microcontroller
    
-   MAX30100 Sensor (Pulse Oximeter and Heart Rate)
    
-   MLX90614 Sensor (Temperature)
    
-   AD8232 Sensor (ECG)
    

### Software:

-   **Frontend:** Next.js, React.js
    
-   **Backend:** Flask, NeuroKit2
    
-   **Secure Tunneling:** Ngrok
    


----------

## Authors

-   **Kuldeep Aher** ([kuldeepaher01](https://github.com/kuldeepaher01))
    
-   **Harshal D** ([harshald01](https://github.com/harshald01))

----------

## Made with ❤️ by Kuldeep and Harshal
