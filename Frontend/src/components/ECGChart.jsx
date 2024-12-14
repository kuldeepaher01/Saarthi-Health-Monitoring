import React, { useEffect, useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ECGChart = ({ data }) => {
    console.log(data);
  const [segments, setSegments] = useState([]);
  const segmentIndex = useRef(0);
  const segmentKeys = Object.keys(data || {}).sort((a, b) => Number(a) - Number(b));
  console.log(segmentKeys);

  const processSegment = (segmentData) => {
    if (!segmentData?.ECG_Clean || !segmentData?.Index) return [];

    console.log("segmentData", segmentData);
    
    return segmentData.Index.map((x, i) => ({
      index: x,
      ecg: segmentData.ECG_Clean[i],
      // Add markers for PQRS peaks if they exist at this index
      isPeak: segmentData.ECG_P_Peaks?.[0] === x ? 'P' :
              segmentData.ECG_Q_Peaks?.[0] === x ? 'Q' :
              segmentData.ECG_R_Peaks?.[0] === x ? 'R' : null
    }));
  };

  useEffect(() => {
    if (!data || segmentKeys.length === 0) return;

    // Initialize with first segment
    const firstSegment = processSegment(data[segmentKeys[0]]);
    setSegments(firstSegment);
    segmentIndex.current = 1;

    console.log("firstSegment", firstSegment);

    // Set up interval to add remaining segments
    const interval = setInterval(() => {
      if (segmentIndex.current >= segmentKeys.length) {
        clearInterval(interval);
        return;
      }

      const nextSegment = processSegment(data[segmentKeys[segmentIndex.current]]);
      console.log("nextSegment", nextSegment);
      setSegments(prev => [...prev, ...nextSegment]);
      segmentIndex.current += 1;
    }, 10000);

    return () => clearInterval(interval);
  }, [data]);

  if (!data) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">Loading ECG data...</CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>ECG Monitoring</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="w-full overflow-hidden">
          <LineChart
            width={800}
            height={400}
            data={segments}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="index" 
              label={{ value: 'Time Index', position: 'bottom' }} 
            />
            <YAxis 
              label={{ value: 'ECG Value (mV)', angle: -90, position: 'left' }} 
              domain={['auto', 'auto']}
            />
            <Tooltip 
              content={({ payload, label }) => {
                if (!payload?.length) return null;
                const data = payload[0].payload;
                return (
                  <div className="bg-white p-2 border rounded shadow">
                    <p className="text-sm">Index: {label}</p>
                    <p className="text-sm">Value: {data.ecg.toFixed(3)} mV</p>
                    {data.isPeak && (
                      <p className="text-sm font-bold">{data.isPeak} Peak</p>
                    )}
                  </div>
                );
              }}
            />
            <Line 
              type="monotone" 
              dataKey="ecg" 
              stroke="#2196F3" 
              dot={point => point.payload.isPeak ? { r: 4, fill: '#f44336' } : false}
              strokeWidth={1.5}
            />
          </LineChart>
        </div>
      </CardContent>
    </Card>
  );
};

export default ECGChart;