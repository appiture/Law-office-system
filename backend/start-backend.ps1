Get-Content .env | ForEach-Object {
    if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
        $name=$matches[1]
        $value=$matches[2]
        [System.Environment]::SetEnvironmentVariable($name,$value)
    }
}

java -jar target\backend-0.0.1-SNAPSHOT.jar