// Test script for generate-anchors endpoint

const testData = {
    parentPositionId: '1A-G7H2K',
    breadth: 'A'
};

console.log('Testing POST /api/generate-anchors...');
console.log('Request body:', testData);
console.log('\nCalling endpoint...\n');

fetch('http://localhost:3000/api/generate-anchors', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(testData)
})
    .then(res => res.json())
    .then(data => {
        console.log('✅ Response received:');
        console.log(JSON.stringify(data, null, 2));
    })
    .catch(error => {
        console.error('❌ Error:', error.message);
    });