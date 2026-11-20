import pytest

from app.sonar.environment import EnvironmentState
from app.sonar.telemetry import FrameError, SerialTelemetrySource, build_frame, checksum, parse_frame


def test_frame_round_trip():
    line = build_frame("ENV", "14.82", "102.5", "103.4", "34.71")
    assert line.startswith("$ENV,") and line[-3] == "*"
    parsed = parse_frame(line)
    assert parsed == {
        "kind": "ENV",
        "temperature_c": 14.82,
        "depth_m": 102.5,
        "pressure_dbar": 103.4,
        "salinity_psu": 34.71,
    }


def test_echo_frame():
    parsed = parse_frame(build_frame("ECHO", 17, 412345, 812.5))
    assert parsed["ping_id"] == 17 and parsed["time_of_flight_us"] == 412345.0


@pytest.mark.parametrize(
    "line",
    ["ENV,1,2,3,4*00", "$ENV,1,2,3,4*00", f"$ENV,1,2,3*{checksum('ENV,1,2,3')}", f"$XYZ,1*{checksum('XYZ,1')}"],
)
def test_bad_frames_rejected(line):
    with pytest.raises(FrameError):
        parse_frame(line)


def test_serial_source_is_a_placeholder():
    with pytest.raises(RuntimeError):
        SerialTelemetrySource("COM3").read(EnvironmentState())
