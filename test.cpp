#include <iostream>
using namespace std;

void displayStudent(student s) {
    cout << "Name: " << s.name << endl;
    cout << "Age: " << s.age << endl;
    cout << "Grade: " << s.grade << endl;
}


int main(){
    struct student {
        string name;
        int age;
        float grade;
    };
    student s1;
    displayStudent(s1);
}