"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { Line as Line1 } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Bluetooth,
  Power,
  Heart,
  Activity,
  Thermometer,
  Stethoscope,
  Download,
  Play,
  Square,
  Upload,
  Timer,
} from "lucide-react";
import axios from "axios";

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const ECGMonitor = () => {
  const [device, setDevice] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isEcgRecording, setIsEcgRecording] = useState(false);
  const [isVitalsRecording, setIsVitalsRecording] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [ecgData, setEcgData] = useState([]);
  const [newData, setNewData] = useState(null);
  const [characteristics, setCharacteristics] = useState({
    ecg: null,
    heartRate: null,
    temperature: null,
    spo2: null,
  });
  const [vitals, setVitals] = useState({
    heartRate: 0,
    spo2: 0,
    temperature: 0,
    respirationRate: 0,
  });
  const timeoutRef = useRef(null);
  const timerRef = useRef(null);

  const [recordingTimer, setRecordingTimer] = useState(0);
  const [analysisResult, setAnalysisResult] = useState(null);

  const [currentSegmentRange, setCurrentSegmentRange] = useState({
    start: 0,
    end: 5,
  });
  const [processedData, setProcessedData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const processSegmentsInWorker = (data) => {
    return new Promise((resolve, reject) => {
      const workerCode = `
        self.onmessage = function(e) {
          try {
            const data = e.data;
            
            // Validate input data
            if (!data || typeof data !== 'object') {
              throw new Error('Invalid data format');
            }
            
            const segments = Object.keys(data);
            if (segments.length === 0) {
              throw new Error('No segments found in data');
            }
            
            let lastXValue = 0;
            let allSegments = [];
            
            segments.sort((a,b) => Number(a) - Number(b)).forEach((key) => {
              const segment = data[key];
              
              // Validate segment data
              if (!segment || !Array.isArray(segment.ECG_Clean) || !Array.isArray(segment.Index)) {
                console.warn(\`Skipping invalid segment: \${key}\, \${!segment}\, \${!Array.isArray(segment.ECG_Clean)}\, \${!Array.isArray(segment.Index)}\`);
                return;
              }
              
              // Ensure arrays are of equal length
              const length = Math.min(segment.ECG_Clean.length, segment.Index.length);
              const yValues = segment.ECG_Clean.slice(0, length);
              const xValues = segment.Index.slice(0, length);
              
              if (length === 0) {
                console.warn(\`Skipping empty segment: \${key}\`);
                return;
              }
              
              const segmentStartX = xValues[0];
              const adjustedXValues = xValues.map(x => x - segmentStartX + lastXValue);
              lastXValue = adjustedXValues[adjustedXValues.length - 1] + 1;
              
              // Safely access peak values
              const metadata = {
                segmentId: key,
                pPeak: Array.isArray(segment.ECG_P_Peaks) && segment.ECG_P_Peaks.length > 1 ? segment.ECG_P_Peaks[1] : null,
                rPeak: Array.isArray(segment.ECG_R_Peaks) && segment.ECG_R_Peaks.length > 1 ? segment.ECG_R_Peaks[1] : null,
                tPeak: Array.isArray(segment.ECG_T_Peaks) && segment.ECG_T_Peaks.length > 1 ? segment.ECG_T_Peaks[1] : null
              };
              
              allSegments.push({
                xValues: adjustedXValues,
                yValues: yValues,
                metadata: metadata
              });
            });
            
            if (allSegments.length === 0) {
              throw new Error('No valid segments processed');
            }
            
            self.postMessage(allSegments);
          } catch (error) {
            self.postMessage({ error: error.message });
          }
        }
      `;

      const blob = new Blob([workerCode], { type: "application/javascript" });
      const worker = new Worker(URL.createObjectURL(blob));

      worker.onmessage = (e) => {
        if (e.data.error) {
          reject(new Error(e.data.error));
        } else {
          resolve(e.data);
        }
        worker.terminate();
      };

      worker.onerror = (error) => {
        reject(new Error("Worker error: " + error.message));
        worker.terminate();
      };

      worker.postMessage(data);
    });
  };

  const createDatasets = useMemo(
    () => (segments, range) => {
      if (!Array.isArray(segments)) {
        console.error("Invalid segments data");
        return [];
      }

      const { start, end } = range || currentSegmentRange;
      const visibleSegments = segments.slice(start, end);

      return visibleSegments
        .map((segment, index) => {
          if (
            !segment ||
            !Array.isArray(segment.yValues) ||
            !Array.isArray(segment.xValues)
          ) {
            console.warn("Invalid segment data, skipping...");
            return null;
          }

          const length = Math.min(
            segment.yValues.length,
            segment.xValues.length
          );
          if (length === 0) return null;

          const downsampleFactor = Math.ceil(length / 1000);
          const downsampledData = Array.from(
            { length: Math.ceil(length / downsampleFactor) },
            (_, i) => ({
              x: segment.xValues[i * downsampleFactor],
              y: segment.yValues[i * downsampleFactor],
            })
          ).filter((point) => point.x != null && point.y != null);

          return {
            label: `Segment ${segment.metadata.segmentId}`,
            data: downsampledData,
            borderColor: `hsl(${0 * 137.5}, 70%, 50%)`,
            segment: {
              borderColor: `hsl(${1 * 137.5}, 70%, 50%, 1)`,
            },
            spanGaps: false,
            borderWidth: 2.5,
            pointRadius: 0,
            metadata: segment.metadata,
          };
        })
        .filter(Boolean);
    },
    []
  ); // Remove currentSegmentRange dependency

  // const options = {
  //   responsive: true,
  //   interaction: {
  //     mode: 'nearest',
  //     intersect: false,
  //     axis: 'x'
  //   },
  //   plugins: {
  //     tooltip: {
  //       callbacks: {
  //         label: (context) => {
  //           const dataset = context.dataset;
  //           return [
  //             `Segment: ${dataset.metadata.segmentId}`,
  //             `Value: ${context.parsed.y.toFixed(3)}`,
  //             `P Peak: ${dataset.metadata.pPeak?.toFixed(3) || 'N/A'}`,
  //             `R Peak: ${dataset.metadata.rPeak?.toFixed(3) || 'N/A'}`,
  //             `T Peak: ${dataset.metadata.tPeak?.toFixed(3) || 'N/A'}`
  //           ];
  //         }
  //       }
  //     },
  //     legend: {
  //       display: false
  //     }
  //   },
  //   onClick: (event, elements) => {
  //     if (elements.length > 0) {
  //       const datasetIndex = elements[0].datasetIndex;
  //       const dataset = event.chart.data.datasets[datasetIndex];

  //       console.log(`Selected Segment ${dataset.metadata.segmentId}:`, dataset.metadata);
  //     }
  //   },
  //   scales: {
  //     x: {
  //       type: 'linear',
  //       display: true
  //     },
  //     y: {
  //       type: 'linear',
  //       display: true
  //     }
  //   }
  // };

  const startTimer = (duration, onComplete) => {
    setRecordingTimer(duration);
    timerRef.current = setInterval(() => {
      setRecordingTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      setRecordingTimer(0);
    }
  };

  // BLE Service UUIDs matching ESP32 code
  const SERVICE_UUIDS = {
    ECG: "4fafc201-1fb5-459e-8fcc-c5c9c331914b",
    HEART_RATE: 0x180d,
    HEALTH_THERM: 0x1809,
    SPO2: 0x1822,
  };

  // BLE Characteristic UUIDs matching ESP32 code
  const CHARACTERISTIC_UUIDS = {
    ECG: "beb5483e-36e1-4688-b7f5-ea07361b26a8",
    HEART_RATE: 0x2a37,
    TEMPERATURE: 0x2a1c,
    SPO2: 0x2a5e,
  };

  const connectToDevice = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        // acceptAllDevices: true,
        filters: [{ services: [SERVICE_UUIDS.ECG] }],
        optionalServices: [
          SERVICE_UUIDS.HEART_RATE,
          SERVICE_UUIDS.HEALTH_THERM,
          SERVICE_UUIDS.SPO2,
        ],
      });

      const server = await device.gatt.connect();

      // Connect to ECG Service
      const ecgService = await server.getPrimaryService(SERVICE_UUIDS.ECG);
      const ecgCharacteristic = await ecgService.getCharacteristic(
        CHARACTERISTIC_UUIDS.ECG
      );

      // Connect to Heart Rate Service
      const hrService = await server.getPrimaryService(
        SERVICE_UUIDS.HEART_RATE
      );
      const hrCharacteristic = await hrService.getCharacteristic(
        CHARACTERISTIC_UUIDS.HEART_RATE
      );

      // Connect to Temperature Service
      const tempService = await server.getPrimaryService(
        SERVICE_UUIDS.HEALTH_THERM
      );
      const tempCharacteristic = await tempService.getCharacteristic(
        CHARACTERISTIC_UUIDS.TEMPERATURE
      );

      // Connect to SpO2 Service
      const spo2Service = await server.getPrimaryService(SERVICE_UUIDS.SPO2);
      const spo2Characteristic = await spo2Service.getCharacteristic(
        CHARACTERISTIC_UUIDS.SPO2
      );

      // Store all characteristics
      setCharacteristics({
        ecg: ecgCharacteristic,
        heartRate: hrCharacteristic,
        temperature: tempCharacteristic,
        spo2: spo2Characteristic,
      });

      setDevice(device);
      setIsConnected(true);

      // Start listening for vital sign notifications
      await startVitalsNotifications(
        hrCharacteristic,
        tempCharacteristic,
        spo2Characteristic
      );

      device.addEventListener("gattserverdisconnected", onDisconnected);
    } catch (error) {
      console.error("Error connecting to device:", error);
    }
  };

  const startVitalsNotifications = async (hrChar, tempChar, spo2Char) => {
    // Handle Heart Rate notifications
    await hrChar.startNotifications();
    hrChar.addEventListener("characteristicvaluechanged", (event) => {
      const value = event.target.value;
      const heartRate = value.getUint8(0);
      setVitals((prev) => ({ ...prev, heartRate }));
    });

    // Handle Temperature notifications
    await tempChar.startNotifications();
    tempChar.addEventListener("characteristicvaluechanged", (event) => {
      const value = event.target.value;
      const tempValue = value.getUint32(0, true) / 100; // Convert from fixed-point
      setVitals((prev) => ({ ...prev, temperature: tempValue }));
    });

    // Handle SpO2 notifications
    await spo2Char.startNotifications();
    spo2Char.addEventListener("characteristicvaluechanged", (event) => {
      const value = event.target.value;
      const spo2 = value.getUint8(0);
      setVitals((prev) => ({ ...prev, spo2 }));
    });
  };

  const onDisconnected = () => {
    setIsConnected(false);
    setDevice(null);
    setCharacteristics({
      ecg: null,
      heartRate: null,
      temperature: null,
      spo2: null,
    });
    setIsRecording(false);
    setVitals({
      heartRate: 0,
      spo2: 0,
      temperature: 0,
      respirationRate: 0,
    });
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  const disconnect = () => {
    if (device) {
      device.gatt.disconnect();
    }
  };

  const startRecording = async () => {
    if (!characteristics.ecg) return;

    setEcgData([]);
    setIsRecording(true);

    await characteristics.ecg.writeValue(new Uint8Array([0x33]));
    await characteristics.ecg.startNotifications();
    characteristics.ecg.addEventListener(
      "characteristicvaluechanged",
      handleEcgData
    );

    timeoutRef.current = setTimeout(stopRecording, 30000);
  };

  const recordECG = async () => {
    if (!characteristics.ecg) return;

    // Send start recording command
    await characteristics.ecg.writeValue(new Uint8Array([0x31]));
    setIsEcgRecording(true);
    setEcgData([]);

    // Start 30-second timer
    startTimer(30, stopECGRecording);

    // Start ECG data notifications
    await characteristics.ecg.startNotifications();
    characteristics.ecg.addEventListener(
      "characteristicvaluechanged",
      handleEcgData
    );
  };

  const stopECGRecording = async () => {
    if (!characteristics.ecg) return;

    // Send stop recording command
    await characteristics.ecg.writeValue(new Uint8Array([0x30]));
    setIsEcgRecording(false);
    stopTimer();

    await characteristics.ecg.stopNotifications();
    characteristics.ecg.removeEventListener(
      "characteristicvaluechanged",
      handleEcgData
    );
  };

  const measureVitals = async () => {
    if (
      !characteristics.heartRate ||
      !characteristics.temperature ||
      !characteristics.spo2
    )
      return;

    // Send start vitals measurement command
    await characteristics.ecg.writeValue(new Uint8Array([0x33]));
    setIsVitalsRecording(true);

    // Start 50-second timer
    startTimer(50, stopVitalsMeasurement);
  };

  const stopVitalsMeasurement = async () => {
    if (!characteristics.heartRate) return;

    // Send stop vitals measurement command
    try {
      await characteristics.ecg.writeValue(new Uint8Array([0x34]));
      setIsVitalsRecording(false);
      stopTimer();
    } catch (e) {
      console.log(e);
    }
  };

  const downloadData = () => {
    const text = ecgData.map((point) => point.value).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ecg_data.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const sendDataToBackend = async () => {
    try {
      setIsProcessing(true);
      console.log("Sending data to backend...");

      const dataToSend = {
        ecg: ecgData.map((point) => point.value),
      };

      const response = await axios.post(
        "http://127.0.0.1:5000/ecg_process",
        dataToSend,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 200 && response.data) {
        console.log("Data rvd successfully");

        try {
          const cleanedData = {};
          Object.keys(response.data).forEach((key) => {
            if (key !== "Quality") {
              cleanedData[key] = response.data[key];
            }
            if (key !== "Heart_Rate") {
              cleanedData[key] = response.data[key];
            }
          });
          const segments = await processSegmentsInWorker(cleanedData);

          console.log(`Processed ${segments.length} segments successfully`);
          setAnalysisResult({
            signalQuality: response.data.Quality || "N/A",
            heartRate: response.data?.Heart_Rate || "N/A",
          });

          setProcessedData(segments);

          const initialRange = { start: 0, end: Math.min(5, segments.length) };
          setCurrentSegmentRange(initialRange);

          const initialDatasets = createDatasets(segments, initialRange);
          setNewData({
            key: Date.now(), // Add a key for initial render
            datasets: initialDatasets,
          });
        } catch (processingError) {
          console.log("Error processing segments:", processingError);
          throw new Error(
            `Failed to process segments: ${processingError.message}`
          );
        }
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      console.log("Error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Modified segment navigation handlers
  const handleNextSegments = () => {
    if (processedData && currentSegmentRange.end < processedData.length) {
      const newRange = {
        start: currentSegmentRange.end,
        end: Math.min(currentSegmentRange.end + 5, processedData.length),
      };
      setCurrentSegmentRange(newRange);

      // Update chart data immediately
      const newDatasets = createDatasets(processedData, newRange);
      setNewData({
        key: Date.now(), // Add a key to force re-render
        datasets: newDatasets,
      });
    }
  };

  const handlePreviousSegments = () => {
    if (currentSegmentRange.start > 0) {
      const newRange = {
        start: Math.max(0, currentSegmentRange.start - 5),
        end: currentSegmentRange.start,
      };
      setCurrentSegmentRange(newRange);

      // Update chart data immediately
      const newDatasets = createDatasets(processedData, newRange);
      setNewData({
        key: Date.now(), // Add a key to force re-render
        datasets: newDatasets,
      });
    }
  };

  const options = {
    responsive: true,
    interaction: {
      mode: "nearest",
      intersect: false,
      axis: "x",
    },
    plugins: {
      tooltip: {
        enabled: true,
        mode: "nearest",
        intersect: false,
        callbacks: {
          label: (context) => {
            const dataset = context.dataset;
            return [
              `Segment: ${dataset.metadata.segmentId}`,
              `Value: ${context.parsed.y.toFixed(3)}`,
              `P Peak: ${dataset.metadata.pPeak?.toFixed(3) || "N/A"}`,
              `R Peak: ${dataset.metadata.rPeak?.toFixed(3) || "N/A"}`,
              `T Peak: ${dataset.metadata.tPeak?.toFixed(3) || "N/A"}`,
            ];
          },
        },
      },
      legend: {
        display: false,
      },
    },
    animation: true, // Disable animations for better performance
    spanGaps: true,
    elements: {
      point: {
        radius: 0, // Hide points for better performance
      },
      line: {
        tension: 0, // Disable bezier curves for better performance
      },
    },
    scales: {
      x: {
        type: "linear",
        display: true,
        ticks: {
          maxTicksLimit: 10, // Limit number of ticks for better performance
        },
      },
      y: {
        type: "linear",
        display: true,
        ticks: {
          maxTicksLimit: 10, // Limit number of ticks for better performance
        },
      },
    },
  };
  const renderPaginationControls = () => (
    <div className="flex justify-center gap-4 mt-4">
      <Button
        onClick={handlePreviousSegments}
        disabled={currentSegmentRange.start === 0}
        variant="outline"
      >
        Previous
      </Button>
      <span className="py-2">
        Showing segments {currentSegmentRange.start + 1} -{" "}
        {currentSegmentRange.end}
        {processedData ? ` of ${processedData.length}` : ""}
      </span>
      <Button
        onClick={handleNextSegments}
        disabled={
          !processedData || currentSegmentRange.end >= processedData.length
        }
        variant="outline"
      >
        Next
      </Button>
    </div>
  );

  const stopRecording = async () => {
    if (!characteristics.ecg) return;

    setIsRecording(false);
    await characteristics.ecg.writeValue(new Uint8Array([0x30]));
    await characteristics.ecg.stopNotifications();
    characteristics.ecg.removeEventListener(
      "characteristicvaluechanged",
      handleEcgData
    );
  };

  const handleEcgData = (event) => {
    const value = event.target.value;
    const data = [];

    // Parse the buffer of uint16 values (matches ESP32 format)
    for (let i = 0; i < value.byteLength; i += 2) {
      const sample = value.getUint16(i, true); // true for little-endian
      data.push(sample);
    }

    setEcgData((prevData) => {
      const newData = [...prevData];
      data.forEach((value) => {
        newData.push({
          time: newData.length,
          value: value,
        });
      });
      return newData;
    });
  };

  const VitalCard = ({ icon: Icon, title, value, unit, normal }) => (
    <Card
      className={`flex-1 transition-all duration-300 ${
        isVitalsRecording || isEcgRecording
          ? "opacity-100 cursor-not-allowed"
          : "hover:shadow-md"
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-center space-x-2">
          <Icon className="h-5 w-5 text-primary" />
          <h3 className="font-medium text-sm text-muted-foreground">{title}</h3>
        </div>
        <div className="mt-2 flex items-baseline">
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <span className="ml-1 text-sm text-muted-foreground">{unit}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Normal: {normal}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-4 space-y-4 bg-background">
      <Card className="shadow-2xl border-none">
        <CardHeader className="bg-primary/10">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Heart className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold text-foreground">
                SARTHI Health Monitor
              </span>
            </div>
            <Badge
              variant={isConnected ? "success" : "destructive"}
              className={`px-4 py-2 ${
                isConnected ? "bg-green-600 text-white" : ""
              }`}
            >
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          {/* Connection Controls */}
          <div className="flex gap-4">
            {!isConnected ? (
              <Button
                onClick={connectToDevice}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Bluetooth className="mr-2 h-5 w-5" />
                Connect Device
              </Button>
            ) : (
              <div className="flex space-x-4">
                <Button onClick={disconnect} variant="destructive">
                  <Power className="mr-2 h-5 w-5" />
                  Disconnect
                </Button>
              </div>
            )}
          </div>

          {/* Vitals Section */}
          {/* Vitals Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <VitalCard
              icon={Heart}
              title="Heart Rate"
              value={vitals.heartRate || analysisResult?.heartRate || 0}
              unit="bpm"
              normal="60-100 bpm"
            />
            <VitalCard
              icon={Activity}
              title="SpO2"
              value={vitals.spo2}
              unit="%"
              normal="95-100%"
            />
            <VitalCard
              icon={Thermometer}
              title="Temperature"
              value={vitals.temperature.toFixed(1)}
              unit="°C"
              normal="36.5-37.5°C"
            />
            {analysisResult && (
              <>
                <VitalCard
                  icon={Activity}
                  title="ECG Signal Quality"
                  value={analysisResult?.signalQuality || "..."}
                  normal="Excellent"
                />
                {/* <VitalCard
                icon={Activity}
                title="Heart Rate"
                value={analysisResult?.heartRate || "..."}
                unit="bpm"
                normal="60-100 bpm"
              /> */}
              </>
            )}
          </div>

          {/* Recording Controls */}
          <div className="flex space-x-4">
            <Button
              onClick={isEcgRecording ? stopECGRecording : recordECG}
              disabled={isVitalsRecording || !isConnected}
              variant={isEcgRecording ? "destructive" : "default"}
              className={`flex-1 ${
                isEcgRecording
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              <Heart className="mr-2 h-5 w-5" />
              {isEcgRecording ? "Stop ECG Recording" : "Record ECG"}
            </Button>

            <Button
              onClick={
                isVitalsRecording ? stopVitalsMeasurement : measureVitals
              }
              disabled={isEcgRecording || !isConnected}
              variant={isVitalsRecording ? "destructive" : "default"}
              className={`flex-1 ${
                isVitalsRecording
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              <Timer className="mr-2 h-5 w-5" />
              {isVitalsRecording ? "Stop Vitals Measurement" : "Measure Vitals"}
            </Button>
          </div>

          {/* Timer Progress */}
          {(isEcgRecording || isVitalsRecording) && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">
                  {isEcgRecording ? "ECG Recording" : "Vitals Measurement"}
                </span>
                <span className="text-muted-foreground">
                  {recordingTimer} sec
                </span>
              </div>
              <Progress
                value={(recordingTimer / (isEcgRecording ? 30 : 50)) * 100}
                className="w-full h-2"
              />
            </div>
          )}

          {/* ECG Graph */}
          <Card className="p-4 bg-card border-none">
            <div className="h-[400px] w-full">
              <ResponsiveContainer>
                <LineChart
                  data={ecgData.slice(-600)}
                  margin={{ top: 20, right: 30, bottom: 20, left: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    dataKey="time"
                    label={{ value: "Time (ms)", position: "bottom" }}
                    stroke="#6b7280"
                  />
                  <YAxis
                    label={{
                      value: "Amplitude (mV)",
                      angle: -90,
                      position: "left",
                    }}
                    stroke="#6b7280"
                  />
                  <Line
                    dataKey="value"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Analysis Section */}
          {ecgData.length > 0 && (
            <div className="mt-4">
              <Button
                onClick={sendDataToBackend}
                variant="outline"
                className="w-full border-primary text-primary hover:bg-primary/10"
              >
                <Upload className="mr-2 h-5 w-5" />
                Analyze ECG Results
              </Button>

              {isProcessing ? (
                <div className="flex justify-center items-center h-[400px]">
                  <div className="text-lg text-gray-600">
                    Processing data...
                  </div>
                </div>
              ) : (
                <>
                  {newData && (
                    <Line1
                      key={newData.key} // Add this key prop
                      data={newData}
                      options={options}
                      redraw={true} // Add this prop
                    />
                  )}
                  {processedData && renderPaginationControls()}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ECGMonitor;
