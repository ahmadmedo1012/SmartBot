"""
Minimal test to verify Python runtime works on Vercel.
"""
def app(request):
    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json"},
        "body": '{"ok":true}',
    }
