from flask import Flask, request, jsonify, send_from_directory
# from flask_session import Session
from flask_cors import CORS  # <-- New import here
from flask_cors import cross_origin
import neurokit2 as nk
import numpy as np
import pandas as pd
import json
import time

app = Flask(__name__)
CORS(app)

@app.route('/ecg_process', methods=['POST'])
def ecg_process():
    timestamp = time.time()
    data = request.get_json()
    ecg = np.array(data["ecg"])
    with open('ecg' + str(timestamp) + '.json', 'w') as outfile:
        json.dump(ecg.tolist(), outfile)

    # Check if the ECG signal is in mV
    if ecg.max() > 100:
        ecg = (ecg - 2000) / (40 * 40)

    ecg_cleaned = nk.ecg_clean(ecg, sampling_rate=250, method="neurokit")
    ecg_cleaned = np.nan_to_num(ecg_cleaned, nan=0)  # Replace NaN values with 0

    quality = nk.ecg_quality(
        ecg_cleaned, sampling_rate=250, method="zhao2018", approach="fuzzy"
    )

    print("[LOG]: ECG Quality: ", quality)

    # Process ECG signal
    ecg_processed, info = nk.ecg_process(ecg, sampling_rate=250)
    ecg_processed = ecg_processed.fillna(0)  

    segmented = nk.ecg_segment(ecg_processed, rpeaks=info["ECG_R_Peaks"], sampling_rate=250, show=False)

    first_40_segments = list(segmented.keys())[:40]

    return_data = {}
    return_data['Quality'] = quality
    hr = calculate_heart_rate(rpeaks=info["ECG_R_Peaks"], ecg_cleaned=ecg_cleaned, sampling_rate=250)
    print("[LOG]: Heart Rate: ", hr)
    return_data['Heart_Rate'] = f'{hr:.2f}'  
    peaks = ['ECG_P_Peaks', 'ECG_Q_Peaks', 'ECG_R_Peaks', 'ECG_S_Peaks', 'ECG_T_Peaks']

    for key in first_40_segments:  
        segmented[key] = segmented[key].fillna(0)

        # Initialize key in return data
        return_data[key] = {
            'Index': segmented[key]['Index'].astype(int).tolist(),
            'ECG_Clean': segmented[key]['ECG_Clean'].astype(float).tolist(),
            'ECG_Raw': segmented[key]['ECG_Raw'].astype(float).tolist(),
            'Start_Index': int(segmented[key]['Index'].iloc[0])  # Convert NumPy type to int
        }

        # Iterate over rows to extract peaks
        for index, row in segmented[key].iterrows():
            for peak in peaks:
                if row[peak] == 1:
                    return_data[key][peak] = [int(row['Index']), float(row['ECG_Clean'])]

    # Save response in a JSON file with the name as timestamp for later testing
    with open('data' + str(timestamp) + '.json', 'w') as outfile:
        json.dump(return_data, outfile)
    
    return jsonify(return_data)

def calculate_heart_rate(rpeaks=None, ecg_cleaned=None, sampling_rate=250):
    _, _1, average_hr = ecg_segment_window(
        rpeaks=rpeaks, sampling_rate=250, desired_length=len(ecg_cleaned)
    )


    return average_hr


def ecg_segment_window(
    heart_rate=None,
    rpeaks=None,
    sampling_rate=1000,
    desired_length=None,
    ratio_pre=0.35,
):
    # function from neurokit2 pasted here for testing reasons
    if heart_rate is not None:
        heart_rate = np.mean(heart_rate)
    if rpeaks is not None:
        heart_rate = np.mean(
            nk.signal_rate(
                rpeaks, sampling_rate=sampling_rate, desired_length=desired_length
            )
        )
        
    # Modulator
    # Note: this is based on quick internal testing but could be improved
    window_size = 60 / heart_rate  # Beats per second

    # Window
    epochs_start = ratio_pre * window_size
    
    epochs_end = (1 - ratio_pre) * window_size

    return -epochs_start, epochs_end, heart_rate

@app.route('/dummy', methods=['POST'])
def dummy():
    try:
        # Read the JSON file
        data = pd.read_csv('ecg_data.txt', delimiter='\t')
        ecg = data.values[:, 0]
        if ecg.max() > 100:
            ecg = (ecg - 2000) / (40 * 40)

        ecg_cleaned = nk.ecg_clean(ecg, sampling_rate=250, method="neurokit")
        ecg_cleaned = np.nan_to_num(ecg_cleaned, nan=0)  # Replace NaN values with 0

        quality = nk.ecg_quality(
            ecg_cleaned, sampling_rate=250, method="zhao2018", approach="fuzzy"
        )

        print("[LOG]: ECG Quality: ", quality)

        # Process ECG signal
        ecg_processed, info = nk.ecg_process(ecg, sampling_rate=250)
        ecg_processed = ecg_processed.fillna(0)  # Replace NaN values in the DataFrame

        # Segment ECG signal
        segmented = nk.ecg_segment(ecg_processed, rpeaks=info["ECG_R_Peaks"], sampling_rate=250, show=False)

        # Limit to the first 40 segments
        first_40_segments = list(segmented.keys())[:40]

        return_data = {}
        return_data['Quality'] = quality
        hr = calculate_heart_rate(rpeaks=info["ECG_R_Peaks"], ecg_cleaned=ecg_cleaned, sampling_rate=250)
        print("[LOG]: Heart Rate: ", hr)
        return_data['Heart_Rate'] = f'{hr:.2f}'  # Add average heart rate
        peaks = ['ECG_P_Peaks', 'ECG_Q_Peaks', 'ECG_R_Peaks', 'ECG_S_Peaks', 'ECG_T_Peaks']

        for key in first_40_segments:  # Loop through only the first 40 segments
            # Replace NaN values in each segment DataFrame
            segmented[key] = segmented[key].fillna(0)

            # Initialize key in return data
            return_data[key] = {
                'Index': segmented[key]['Index'].astype(int).tolist(),
                'ECG_Clean': segmented[key]['ECG_Clean'].astype(float).tolist(),
                'ECG_Raw': segmented[key]['ECG_Raw'].astype(float).tolist(),
                'Start_Index': int(segmented[key]['Index'].iloc[0])  # Convert NumPy type to int
            }

            # Iterate over rows to extract peaks
            for index, row in segmented[key].iterrows():
                for peak in peaks:
                    if row[peak] == 1:
                        # Add peak data to return_data
                        return_data[key][peak] = [int(row['Index']), float(row['ECG_Clean'])]
        
        # Return JSON response
        return jsonify(return_data)


    except FileNotFoundError:
        return {"error": "1.json file not found"}, 404
    except Exception as e:
        return {"error": str(e)}, 500

if __name__ == '__main__':  
     app.run(host='0.0.0.0', debug=True)