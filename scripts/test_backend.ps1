Set-Location "$PSScriptRoot\..\backend"
pip install -r requirements.txt
pytest -q
