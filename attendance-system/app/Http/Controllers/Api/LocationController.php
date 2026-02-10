<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\Request;

class LocationController extends Controller
{
    private function readJson($path)
    {
        $content = Storage::disk('local')->get($path);
        return json_decode($content, true) ?? [];
    }

    public function provinces()
    {
        $provinces = $this->readJson('reference/provinces.json');
        return response()->json($provinces);
    }

    public function cities(Request $request)
    {
        $province = $request->query('province');
        $data = $this->readJson('reference/cities.json');
        $cities = $province && isset($data[$province]) ? $data[$province] : [];
        return response()->json($cities);
    }

    public function barangays(Request $request)
    {
        $province = $request->query('province');
        $city = $request->query('city');
        $data = $this->readJson('reference/barangays.json');
        $barangays = $province && $city && isset($data[$province][$city]) ? $data[$province][$city] : [];
        return response()->json($barangays);
    }
}
