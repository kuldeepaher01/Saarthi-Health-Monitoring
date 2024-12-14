"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
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
  Upload, 
  Pulse, 
  Timer 
} from "lucide-react";
import axios from "axios";

const ECGMonitor = () => {
  const [device, setDevice] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isEcgRecording, setIsEcgRecording] = useState(false);
  const [isVitalsRecording, setIsVitalsRecording] = useState(false);
  const [ecgData, setEcgData] = useState([]);
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
  const [recordingTimer, setRecordingTimer] = useState(0);
  const timerRef = useRef(null);
  const [analysisResult, setAnalysisResult] = useState(null);

  // BLE Service and Characteristic UUIDs (unchanged)
  const SERVICE_UUIDS = { /* ... existing code ... */ };
  const CHARACTERISTIC_UUIDS = { /* ... existing code ... */ };

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
    if (!characteristics.heartRate || !characteristics.temperature || !characteristics.spo2) return;

    // Send start vitals measurement command
    await characteristics.heartRate.writeValue(new Uint8Array([0x33]));
    setIsVitalsRecording(true);

    // Start 50-second timer
    startTimer(50, stopVitalsMeasurement);
  };

  const stopVitalsMeasurement = async () => {
    if (!characteristics.heartRate) return;

    // Send stop vitals measurement command
    await characteristics.heartRate.writeValue(new Uint8Array([0x34]));
    setIsVitalsRecording(false);
    stopTimer();
  };

  const analyzeResults = async () => {
    try {
      const response = await axios.post(
        "http://127.0.0.1:5000/analyze",
        { ecg: ecgData.map((point) => point.value) },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 200) {
        setAnalysisResult(response.data);
      }
    } catch (error) {
      console.error("Analysis failed:", error);
    }
  };

  // Existing methods like connectToDevice, handleEcgData, etc. remain the same

  const VitalCard = ({ icon: Icon, title, value, unit, normal }) => (
    <Card 
      className={`flex-1 transition-all duration-300 ${
        isVitalsRecording || isEcgRecording 
          ? "opacity-50 cursor-not-allowed" 
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
              <Pulse className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold text-foreground">SARTHI Health Monitor</span>
            </div>
            <Badge
              variant={isConnected ? "success" : "secondary"}
              className={`px-4 py-2 ${
                isConnected
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
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
                <Button 
                  onClick={disconnect} 
                  variant="destructive"
                >
                  <Power className="mr-2 h-5 w-5" />
                  Disconnect
                </Button>
              </div>
            )}
          </div>

          {/* Vitals Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <VitalCard
              icon={Heart}
              title="Heart Rate"
              value={vitals.heartRate}
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
            <VitalCard
              icon={Stethoscope}
              title="Respiration"
              value={vitals.respirationRate}
              unit="bpm"
              normal="12-20 bpm"
            />
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
              <Pulse className="mr-2 h-5 w-5" />
              {isEcgRecording ? "Stop ECG Recording" : "Record ECG"}
            </Button>

            <Button
              onClick={isVitalsRecording ? stopVitalsMeasurement : measureVitals}
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
                <span className="text-muted-foreground">{recordingTimer} sec</span>
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
                  data={ecgData.slice(-200)}
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
                    type="monotone"
                    dataKey="value"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Analysis Section */}
          {ecgData.length > 0 && (
            <div className="mt-4">
              <Button 
                onClick={analyzeResults}
                variant="outline"
                className="w-full border-primary text-primary hover:bg-primary/10"
              >
                <Upload className="mr-2 h-5 w-5" />
                Analyze ECG Results
              </Button>

              {analysisResult && (
                <Card className="mt-4 p-6 bg-card">
                  <CardHeader className="p-0 mb-4">
                    <CardTitle className="text-xl">Analysis Results</CardTitle>
                  </CardHeader>
                  <pre className="bg-muted p-4 rounded-lg text-sm">
                    {JSON.stringify(analysisResult, null, 2)}
                  </pre>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ECGMonitor;